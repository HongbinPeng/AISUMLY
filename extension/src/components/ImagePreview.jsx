export default function ImagePreview({ images, onRemove }) {
  if (!images || images.length === 0) return null

  return (
    <div className="image-previews">
      {images.map((img, index) => (
        <div key={index} className="image-preview-item">
          <img src={img.url} alt={img.filename} />
          <button className="remove-btn" onClick={() => onRemove(index)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
