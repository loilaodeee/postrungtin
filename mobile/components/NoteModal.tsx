import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';

const QUICK_NOTES = [
  'Không hành',
  'Không giá',
  'Mì mềm',
  'Mì dai',
  'Nước trong',
  'Nước béo',
  'Nhiều hành',
  'Nhiều tóp mỡ',
  'Không tóp mỡ'
];

export default function NoteModal({ isOpen, onClose, onConfirm, foodName, quickNotes = [] }) {
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [customNote, setCustomNote] = useState('');

  const handleToggleNote = (note) => {
    setSelectedNotes(prev =>
      prev.includes(note) ? prev.filter(n => n !== note) : [...prev, note]
    );
  };

  const handleConfirm = () => {
    const finalNotes = [...selectedNotes];
    if (customNote.trim()) {
      finalNotes.push(customNote.trim());
    }
    onConfirm(finalNotes);
    
    // Reset state
    setSelectedNotes([]);
    setCustomNote('');
    onClose();
  };

  const handleCancel = () => {
    setSelectedNotes([]);
    setCustomNote('');
    onClose();
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Thêm Ghi Chú</Text>
            <Text style={styles.foodName}>{foodName}</Text>
          </View>

          {/* Body */}
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Gợi ý nhanh:</Text>
            <View style={styles.chipsGrid}>
              {(quickNotes.length > 0 ? quickNotes : QUICK_NOTES).map(note => {
                const isSelected = selectedNotes.includes(note);
                return (
                  <TouchableOpacity
                    key={note}
                    style={[styles.noteChip, isSelected && styles.noteChipActive]}
                    onPress={() => handleToggleNote(note)}
                  >
                    <Text style={[styles.noteChipText, isSelected && styles.noteChipTextActive]}>
                      {note}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Ghi chú khác:</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Nhập ghi chú tùy ý (ví dụ: ít bánh, nhiều thịt...)"
              placeholderTextColor="#94a3b8"
              value={customNote}
              onChangeText={setCustomNote}
            />
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.btnCancel} onPress={handleCancel}>
              <Text style={styles.btnCancelText}>HỦY</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm}>
              <Text style={styles.btnConfirmText}>XÁC NHẬN MÓN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  foodName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e3a8a',
    marginTop: 4,
  },
  modalBody: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    marginTop: 10,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  noteChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  noteChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  noteChipText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  noteChipTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 20,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  btnConfirm: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
