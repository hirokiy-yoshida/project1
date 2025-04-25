import { OrderItem } from '../types/order';

type ConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  orderItems: OrderItem[];
};

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  orderItems,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col shadow-xl">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">注文内容の確認</h2>
        
        <div className="overflow-y-auto flex-1 mb-6">
          <div className="space-y-3">
            {orderItems.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center p-3 bg-white border border-gray-200 rounded-lg"
              >
                <span className="font-medium text-gray-500 w-8">
                  {index + 1}.
                </span>
                <span className="text-gray-800">
                  {[
                    item.drinkMenu?.name,
                    item.foodMenu && `${item.foodMenu.name}${item.isEatIn ? '（店内）' : '（持ち帰り）'}`
                  ].filter(Boolean).join(' / ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            注文を確定する
          </button>
        </div>
      </div>
    </div>
  );
}