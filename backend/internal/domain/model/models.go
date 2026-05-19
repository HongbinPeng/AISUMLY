package model

import (
	"time"

	"gorm.io/datatypes"
)

type User struct {
	ID           uint64     `gorm:"primaryKey;column:id" json:"id"`
	Email        string     `gorm:"column:email" json:"email"`
	PasswordHash string     `gorm:"column:password_hash" json:"-"`
	Nickname     string     `gorm:"column:nickname" json:"nickname"`
	AvatarURL    string     `gorm:"column:avatar_url" json:"avatar_url"`
	Status       int8       `gorm:"column:status" json:"status"`
	LastLoginAt  *time.Time `gorm:"column:last_login_at" json:"last_login_at"`
	CreatedAt    time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt    *time.Time `gorm:"column:deleted_at" json:"-"`
}

func (User) TableName() string { return "users" }

type Conversation struct {
	ID                 uint64     `gorm:"primaryKey;column:id" json:"id"`
	UserID             uint64     `gorm:"column:user_id" json:"user_id"`
	Title              string     `gorm:"column:title" json:"title"`
	Status             int8       `gorm:"column:status" json:"status"`
	MessageCount       uint       `gorm:"column:message_count" json:"message_count"`
	LastTurnNo         uint       `gorm:"column:last_turn_no" json:"last_turn_no"`
	LastSequenceNo     uint64     `gorm:"column:last_sequence_no" json:"last_sequence_no"`
	LastMessagePreview string     `gorm:"column:last_message_preview" json:"last_message_preview"`
	LastActiveAt       time.Time  `gorm:"column:last_active_at" json:"last_active_at"`
	CreatedAt          time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt          time.Time  `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt          *time.Time `gorm:"column:deleted_at" json:"-"`
}

func (Conversation) TableName() string { return "conversations" }

type File struct {
	ID               uint64     `gorm:"primaryKey;column:id" json:"id"`
	UserID           uint64     `gorm:"column:user_id" json:"user_id"`
	StorageProvider  string     `gorm:"column:storage_provider" json:"storage_provider"`
	Bucket           string     `gorm:"column:bucket" json:"bucket"`
	ObjectKey        string     `gorm:"column:object_key;size:512" json:"object_key"`
	PublicURL        string     `gorm:"column:public_url;size:1200" json:"public_url"`
	OriginalFilename string     `gorm:"column:original_filename" json:"original_filename"`
	MimeType         string     `gorm:"column:mime_type" json:"mime_type"`
	SizeBytes        uint64     `gorm:"column:size_bytes" json:"size_bytes"`
	SHA256           string     `gorm:"column:sha256" json:"sha256"`
	SourceType       string     `gorm:"column:source_type" json:"source_type"`
	UploadStatus     int8       `gorm:"column:upload_status" json:"upload_status"`
	CreatedAt        time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt        *time.Time `gorm:"column:deleted_at" json:"-"`
}

func (File) TableName() string { return "files" }

type Message struct {
	ID             uint64         `gorm:"primaryKey;column:id" json:"id"`
	UserID         uint64         `gorm:"column:user_id" json:"user_id"`
	ConversationID uint64         `gorm:"column:conversation_id" json:"conversation_id"`
	TurnNo         uint           `gorm:"column:turn_no" json:"turn_no"`
	Role           string         `gorm:"column:role" json:"role"`
	Content        string         `gorm:"column:content" json:"content"`
	ContentFormat  string         `gorm:"column:content_format" json:"content_format"`
	SequenceNo     uint64         `gorm:"column:sequence_no" json:"sequence_no"`
	Status         int8           `gorm:"column:status" json:"status"`
	ModelName      string         `gorm:"column:model_name" json:"model_name"`
	TokenUsage     datatypes.JSON `gorm:"column:token_usage" json:"token_usage"`
	SourceURL      string         `gorm:"column:source_url" json:"source_url"`
	SourceTitle    string         `gorm:"column:source_title" json:"source_title"`
	ErrorMessage   string         `gorm:"column:error_message" json:"error_message"`
	IsFavorite     bool           `gorm:"column:is_favorite" json:"is_favorite"`
	IsUnderstood   bool           `gorm:"column:is_understood" json:"is_understood"`
	IsReviewLater  bool           `gorm:"column:is_review_later" json:"is_review_later"`
	UserNote       string         `gorm:"column:user_note" json:"user_note"`
	CreatedAt      time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"column:updated_at" json:"updated_at"`
	DeletedAt      *time.Time     `gorm:"column:deleted_at" json:"-"`
	Attachments    []Attachment   `gorm:"-" json:"attachments,omitempty"`
}

func (Message) TableName() string { return "messages" }

type MessageAttachment struct {
	ID             uint64    `gorm:"primaryKey;column:id" json:"id"`
	UserID         uint64    `gorm:"column:user_id" json:"user_id"`
	MessageID      uint64    `gorm:"column:message_id" json:"message_id"`
	FileID         uint64    `gorm:"column:file_id" json:"file_id"`
	AttachmentType string    `gorm:"column:attachment_type" json:"attachment_type"`
	SortOrder      uint      `gorm:"column:sort_order" json:"sort_order"`
	CreatedAt      time.Time `gorm:"column:created_at" json:"created_at"`
}

func (MessageAttachment) TableName() string { return "message_attachments" }

type Attachment struct {
	ID             uint64 `json:"id"`
	FileID         uint64 `json:"file_id"`
	AttachmentType string `json:"attachment_type"`
	SortOrder      uint   `json:"sort_order"`
	PreviewURL     string `json:"preview_url"`
	MimeType       string `json:"mime_type"`
	SizeBytes      uint64 `json:"size_bytes"`
}

type DailySummary struct {
	ID           uint64     `gorm:"primaryKey;column:id" json:"id"`
	UserID       uint64     `gorm:"column:user_id" json:"user_id"`
	SummaryDate  time.Time  `gorm:"column:summary_date" json:"summary_date"`
	Title        string     `gorm:"column:title" json:"title"`
	Overview     string     `gorm:"column:overview" json:"overview"`
	Status       int8       `gorm:"column:status" json:"status"`
	ModelName    string     `gorm:"column:model_name" json:"model_name"`
	ErrorMessage string     `gorm:"column:error_message" json:"error_message"`
	UserNote     string     `gorm:"column:user_note" json:"user_note"`
	GeneratedAt  *time.Time `gorm:"column:generated_at" json:"generated_at"`
	CreatedAt    time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (DailySummary) TableName() string { return "daily_summaries" }

type DailySummaryItem struct {
	ID                     uint64         `gorm:"primaryKey;column:id" json:"id"`
	SummaryID              uint64         `gorm:"column:summary_id" json:"summary_id"`
	UserID                 uint64         `gorm:"column:user_id" json:"user_id"`
	ItemType               string         `gorm:"column:item_type" json:"item_type"`
	Title                  string         `gorm:"column:title" json:"title"`
	Content                string         `gorm:"column:content" json:"content"`
	EvidenceIDs            datatypes.JSON `gorm:"column:evidence_ids" json:"evidence_ids"`
	RelatedConversationIDs datatypes.JSON `gorm:"column:related_conversation_ids" json:"related_conversation_ids"`
	RelatedMessageIDs      datatypes.JSON `gorm:"column:related_message_ids" json:"related_message_ids"`
	RelatedFileIDs         datatypes.JSON `gorm:"column:related_file_ids" json:"related_file_ids"`
	SortOrder              uint           `gorm:"column:sort_order" json:"sort_order"`
	IsPinned               bool           `gorm:"column:is_pinned" json:"is_pinned"`
	CreatedAt              time.Time      `gorm:"column:created_at" json:"created_at"`
	UpdatedAt              time.Time      `gorm:"column:updated_at" json:"updated_at"`
}

func (DailySummaryItem) TableName() string { return "daily_summary_items" }
