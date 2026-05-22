package repository

import (
	"context"
	"errors"

	"aisumly/backend/internal/domain/model"

	"gorm.io/gorm"
)

type FileRepository struct {
	db *gorm.DB
}

func NewFileRepository(db *gorm.DB) *FileRepository {
	return &FileRepository{db: db}
}

func (r *FileRepository) Create(ctx context.Context, file *model.File) error {
	return r.db.WithContext(ctx).Create(file).Error
}

func (r *FileRepository) FindReusableImage(ctx context.Context, userID uint64, sha256 string, sizeBytes uint64, mimeType string, statuses []int8) (*model.File, bool, error) {
	var file model.File
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND sha256 = ? AND size_bytes = ? AND mime_type = ? AND upload_status IN ? AND deleted_at IS NULL",
			userID, sha256, sizeBytes, mimeType, statuses).
		Order("upload_status DESC, id DESC").
		First(&file).Error
	if err == nil {
		return &file, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, nil
	}
	return nil, false, err
}

func (r *FileRepository) ListUploadedByIDs(ctx context.Context, db *gorm.DB, userID uint64, fileIDs []uint64, uploadedStatus int8) ([]model.File, error) {
	if db == nil {
		db = r.db
	}
	var files []model.File
	err := db.WithContext(ctx).
		Where("user_id = ? AND id IN ? AND upload_status = ? AND deleted_at IS NULL", userID, fileIDs, uploadedStatus).
		Find(&files).Error
	return files, err
}

func (r *FileRepository) ListByIDs(ctx context.Context, userID uint64, fileIDs []uint64) ([]model.File, error) {
	var files []model.File
	err := r.db.WithContext(ctx).Where("user_id = ? AND id IN ? AND deleted_at IS NULL", userID, fileIDs).Find(&files).Error
	return files, err
}

func (r *FileRepository) UpdateUploadStatus(ctx context.Context, userID uint64, fileIDs []uint64, status int8) error {
	return r.db.WithContext(ctx).Model(&model.File{}).Where("user_id = ? AND id IN ?", userID, fileIDs).Update("upload_status", status).Error
}

func (r *FileRepository) GetUploaded(ctx context.Context, userID, fileID uint64, uploadedStatus int8) (*model.File, error) {
	var file model.File
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ? AND upload_status = ? AND deleted_at IS NULL", fileID, userID, uploadedStatus).First(&file).Error; err != nil {
		return nil, err
	}
	return &file, nil
}
