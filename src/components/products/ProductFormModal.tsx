import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ProductForm from './ProductForm';
import { Product, ProductInsert, ProductUpdate } from '../../hooks/useProducts';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProductInsert | ProductUpdate) => Promise<void>;
  product: Product | null;
  isSaving: boolean;
}

const ProductFormModal: React.FC<ProductFormModalProps> = ({ isOpen, onClose, onSave, product, isSaving }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-glass-200 border border-white/20 rounded-3xl shadow-2xl w-full max-w-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <h1 className="text-2xl font-bold text-gray-800">
                  {product ? 'Editar Produto' : 'Novo Produto'}
                </h1>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-800 z-50">
                  <X size={24} />
                </button>
              </div>
              <ProductForm 
                product={product} 
                onSave={onSave} 
                onCancel={onClose} 
                isSaving={isSaving} 
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProductFormModal;
