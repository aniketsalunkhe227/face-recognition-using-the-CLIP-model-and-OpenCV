import React from 'react';
import './modal.css';

const Modal = ({ show, onClose, imageUrl }) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <img src={imageUrl} alt="Preview" className="modal-image" />
      </div>
    </div>
  );
};

export default Modal;
