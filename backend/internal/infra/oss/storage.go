package storage

import (
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"aisumly/backend/internal/config"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
)

type SignedURL struct {
	URL       string
	Headers   map[string]string
	ExpiresIn int64
}

type Storage interface {
	SignedPutURL(ctx context.Context, objectKey string, contentType string, expiresIn time.Duration) (*SignedURL, error)
	SignedGetURL(ctx context.Context, objectKey string, expiresIn time.Duration) (*SignedURL, error)
	Head(ctx context.Context, objectKey string) error
	BucketName() string
}

type OSSStorage struct {
	cfg config.OSSConfig
}

func NewOSSStorage(cfg config.OSSConfig) Storage {
	return &OSSStorage{cfg: cfg}
}

func (s *OSSStorage) BucketName() string {
	if s.cfg.Bucket == "" {
		return "local-dev"
	}
	return s.cfg.Bucket
}

func (s *OSSStorage) SignedPutURL(ctx context.Context, objectKey string, contentType string, expiresIn time.Duration) (*SignedURL, error) {
	if s.isMock() {
		return &SignedURL{URL: "mock://oss-put/" + objectKey, Headers: map[string]string{"Content-Type": contentType}, ExpiresIn: int64(expiresIn.Seconds())}, nil
	}
	bucket, err := s.bucket()
	if err != nil {
		return nil, err
	}
	u, err := bucket.SignURL(objectKey, oss.HTTPPut, int64(expiresIn.Seconds()), oss.ContentType(contentType))
	if err != nil {
		return nil, err
	}
	return &SignedURL{URL: u, Headers: map[string]string{"Content-Type": contentType}, ExpiresIn: int64(expiresIn.Seconds())}, nil
}

func (s *OSSStorage) SignedGetURL(ctx context.Context, objectKey string, expiresIn time.Duration) (*SignedURL, error) {
	if s.isMock() {
		return &SignedURL{URL: "mock://oss-get/" + objectKey, Headers: map[string]string{}, ExpiresIn: int64(expiresIn.Seconds())}, nil
	}
	bucket, err := s.bucket()
	if err != nil {
		return nil, err
	}
	u, err := bucket.SignURL(objectKey, oss.HTTPGet, int64(expiresIn.Seconds()))
	if err != nil {
		return nil, err
	}
	return &SignedURL{URL: u, Headers: map[string]string{}, ExpiresIn: int64(expiresIn.Seconds())}, nil
}

func (s *OSSStorage) Head(ctx context.Context, objectKey string) error {
	if s.isMock() {
		return nil
	}
	bucket, err := s.bucket()
	if err != nil {
		return err
	}
	_, err = bucket.GetObjectMeta(objectKey)
	return err
}

func (s *OSSStorage) isMock() bool {
	return s.cfg.Endpoint == "" || s.cfg.AccessKeyID == "" || s.cfg.AccessKeySecret == "" || s.cfg.Bucket == ""
}

func (s *OSSStorage) bucket() (*oss.Bucket, error) {
	client, err := oss.New(s.cfg.Endpoint, s.cfg.AccessKeyID, s.cfg.AccessKeySecret)
	if err != nil {
		return nil, err
	}
	return client.Bucket(s.cfg.Bucket)
}

func BuildObjectKey(userID uint64, filename string) string {
	ext := path.Ext(filename)
	if ext == "" {
		ext = ".png"
	}
	return fmt.Sprintf("users/%d/images/%s/%d%s", userID, time.Now().Format("2006/01/02"), time.Now().UnixNano(), ext)
}

func PublicURL(baseURL, objectKey string) string {
	if baseURL == "" {
		return ""
	}
	return strings.TrimRight(baseURL, "/") + "/" + objectKey
}
