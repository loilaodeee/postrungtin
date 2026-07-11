import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

const QUICK_NOTES = [
  'Không hành',
  'Không giá',
  'Không tóp mỡ',
  'Nhiều tóp mỡ',
  'Nước béo',
  'Nước trong',
  'Nhiều thịt',
  'Mì dai',
  'Mì mềm'
];

export default function NoteModal({ isOpen, onClose, onConfirm, foodName, quickNotes = [] }) {
  const [selectedChips, setSelectedChips] = useState([]);
  const [customText, setCustomText] = useState('');

  // Reset states when modal opens/closes or foodName changes
  useEffect(() => {
    if (isOpen) {
      setSelectedChips([]);
      setCustomText('');
    }
  }, [isOpen, foodName]);

  if (!isOpen) return null;

  const toggleChip = (chip) => {
    setSelectedChips(prev => 
      prev.includes(chip) 
        ? prev.filter(c => c !== chip) 
        : [...prev, chip]
    );
  };

  const handleConfirm = () => {
    const finalNotes = [...selectedChips];
    if (customText.trim()) {
      finalNotes.push(customText.trim());
    }
    onConfirm(finalNotes);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content animate-pop">
        <div className="modal-header">
          <div>
            <h3>✍️ Tùy chọn món</h3>
            <h2 className="modal-food-name">{foodName}</h2>
          </div>
          <button className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <label className="input-label">Chọn nhanh ghi chú:</label>
          <div className="note-chips-grid">
            {(quickNotes.length > 0 ? quickNotes : QUICK_NOTES).map(chip => {
              const isSelected = selectedChips.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-btn ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleChip(chip)}
                >
                  {chip}
                  {isSelected && <Check size={12} style={{ marginLeft: 4 }} />}
                </button>
              );
            })}
          </div>

          <div className="custom-input-group">
            <label htmlFor="custom-note" className="input-label">Ghi chú khác:</label>
            <input
              id="custom-note"
              type="text"
              className="custom-note-input"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Ví dụ: nhiều thịt, nước béo nguội, cay..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-primary" onClick={handleConfirm}>Xác nhận món</button>
        </div>
      </div>
    </div>
  );
}
