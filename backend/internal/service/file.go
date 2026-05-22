package service

import (
	"context"
	"errors"
	"path/filepath"
	"regexp"
	"time"

	"aisumly/backend/internal/domain/model"
	storage "aisumly/backend/internal/infra/oss"
	"aisumly/backend/internal/repository"
)

const (
	FileStatusPending  int8 = 1
	FileStatusUploaded int8 = 2
	FileStatusFailed   int8 = 3
	FileStatusDeleted  int8 = 4
)

type FileService struct {
	repo    *repository.FileRepository
	storage storage.Storage
}

type CreateUploadURLInput struct {
	Filename  string `json:"filename"`
	MimeType  string `json:"mime_type"`
	SizeBytes uint64 `json:"size_bytes"`
	SHA256    string `json:"sha256"`
}

type UploadURLItem struct {
	FileID         uint64            `json:"file_id"`
	ObjectKey      string            `json:"object_key"`
	UploadURL      string            `json:"upload_url"`
	Method         string            `json:"method"`
	Headers        map[string]string `json:"headers"`
	ExpiresIn      int64             `json:"expires_in"`
	UploadRequired bool              `json:"upload_required"`
	UploadStatus   int8              `json:"upload_status"`
	Reused         bool              `json:"reused"`
	SHA256         string            `json:"sha256"`
}

type ConfirmItem struct {
	FileID       uint64 `json:"file_id"`
	UploadStatus int8   `json:"upload_status"`
}

func NewFileService(repo *repository.FileRepository, st storage.Storage) *FileService {
	return &FileService{repo: repo, storage: st}
}

func (s *FileService) CreateImageUploadURLs(ctx context.Context, userID uint64, inputs []CreateUploadURLInput) ([]UploadURLItem, error) {
	if len(inputs) == 0 {
		return nil, errors.New("请选择要上传的图片")
	}
	if len(inputs) > 5 {
		return nil, errors.New("单次最多只能上传 5 张图片")
	}
	items := make([]UploadURLItem, 0, len(inputs))
	for _, in := range inputs {
		if in.SizeBytes == 0 || in.SizeBytes > 10*1024*1024 {
			return nil, errors.New("图片大小不符合要求")
		}
		if !isSupportedImage(in.MimeType) {
			return nil, errors.New("不支持的图片格式")
		}
		if in.SHA256 != "" && !isValidSHA256(in.SHA256) {
			return nil, errors.New("图片 SHA256 格式不正确")
		}
		if item, ok, err := s.reuseImageBySHA256(ctx, userID, in); err != nil {
			return nil, err
		} else if ok {
			items = append(items, item)
			continue
		}
		objectKey := storage.BuildObjectKey(userID, filepath.Base(in.Filename))
		file := model.File{
			UserID:           userID,
			StorageProvider:  "aliyun_oss",
			Bucket:           s.storage.BucketName(),
			ObjectKey:        objectKey,
			PublicURL:        "",
			OriginalFilename: in.Filename,
			MimeType:         in.MimeType,
			SizeBytes:        in.SizeBytes,
			SHA256:           in.SHA256,
			SourceType:       "paste",
			UploadStatus:     FileStatusPending,
		}
		if err := s.repo.Create(ctx, &file); err != nil {
			return nil, err
		}
		signed, err := s.storage.SignedPutURL(ctx, objectKey, in.MimeType, 15*time.Minute)
		if err != nil {
			return nil, err
		}
		items = append(items, UploadURLItem{
			FileID:         file.ID,
			ObjectKey:      objectKey,
			UploadURL:      signed.URL,
			Method:         "PUT",
			Headers:        signed.Headers,
			ExpiresIn:      signed.ExpiresIn,
			UploadRequired: true,
			UploadStatus:   FileStatusPending,
			Reused:         false,
			SHA256:         in.SHA256,
		})
	}
	return items, nil
}

func (s *FileService) reuseImageBySHA256(ctx context.Context, userID uint64, in CreateUploadURLInput) (UploadURLItem, bool, error) {
	if in.SHA256 == "" {
		return UploadURLItem{}, false, nil
	}
	file, ok, err := s.repo.FindReusableImage(ctx, userID, in.SHA256, in.SizeBytes, in.MimeType, []int8{FileStatusUploaded, FileStatusPending})
	if err != nil || !ok {
		return UploadURLItem{}, ok, err
	}
	if file.UploadStatus == FileStatusUploaded {
		return UploadURLItem{
			FileID:         file.ID,
			ObjectKey:      file.ObjectKey,
			Headers:        map[string]string{},
			UploadRequired: false,
			UploadStatus:   file.UploadStatus,
			Reused:         true,
			SHA256:         file.SHA256,
		}, true, nil
	}
	signed, err := s.storage.SignedPutURL(ctx, file.ObjectKey, file.MimeType, 15*time.Minute)
	if err != nil {
		return UploadURLItem{}, false, err
	}
	return UploadURLItem{
		FileID:         file.ID,
		ObjectKey:      file.ObjectKey,
		UploadURL:      signed.URL,
		Method:         "PUT",
		Headers:        signed.Headers,
		ExpiresIn:      signed.ExpiresIn,
		UploadRequired: true,
		UploadStatus:   file.UploadStatus,
		Reused:         true,
		SHA256:         file.SHA256,
	}, true, nil
}

func (s *FileService) ConfirmImages(ctx context.Context, userID uint64, fileIDs []uint64) ([]ConfirmItem, error) {
	fileIDs = uniqueUint64s(fileIDs)
	if len(fileIDs) == 0 {
		return nil, errors.New("请选择要确认的图片")
	}
	files, err := s.repo.ListByIDs(ctx, userID, fileIDs)
	if err != nil {
		return nil, err
	}
	if len(files) != len(fileIDs) {
		return nil, errors.New("部分图片不存在")
	}
	fileByID := make(map[uint64]model.File, len(files))
	for _, f := range files {
		fileByID[f.ID] = f
	}
	for _, id := range fileIDs {
		f := fileByID[id]
		if err := s.storage.Head(ctx, f.ObjectKey); err != nil {
			return nil, err
		}
	}
	if err := s.repo.UpdateUploadStatus(ctx, userID, fileIDs, FileStatusUploaded); err != nil {
		return nil, err
	}
	items := make([]ConfirmItem, 0, len(fileIDs))
	for _, id := range fileIDs {
		items = append(items, ConfirmItem{FileID: id, UploadStatus: FileStatusUploaded})
	}
	return items, nil
}

func (s *FileService) PreviewURL(ctx context.Context, userID, fileID uint64) (string, int64, error) {
	file, err := s.repo.GetUploaded(ctx, userID, fileID, FileStatusUploaded)
	if err != nil {
		return "", 0, err
	}
	signed, err := s.storage.SignedGetURL(ctx, file.ObjectKey, 15*time.Minute)
	if err != nil {
		return "", 0, err
	}
	return signed.URL, signed.ExpiresIn, nil
}

var sha256Pattern = regexp.MustCompile(`^[a-fA-F0-9]{64}$`)

func isValidSHA256(v string) bool {
	return sha256Pattern.MatchString(v)
}
