'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

type LayoutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  customers: Array<{
    id: string;
    name: string;
    xCoordinate: number;
    yCoordinate: number;
    screenWidth?: number;
    screenHeight?: number;
  }>;
  selectedCustomerId?: string | null;
};

// 画像の基準サイズを定義
const BASE_WIDTH = 1920;  // 画像の実際の幅
const BASE_HEIGHT = 1080; // 画像の実際の高さ

export default function LayoutModal({
  isOpen,
  onClose,
  imageUrl,
  customers,
  selectedCustomerId,
}: LayoutModalProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 選択されたカスタマーIDが変更されたときにコンポーネントを強制的に再レンダリング
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!isOpen || !imageUrl || !containerRef.current) return;

    const updateImageSize = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerWidth = container.clientWidth - 32; // padding
      const containerHeight = container.clientHeight - 32; // padding
      
      // アスペクト比を維持しながら、コンテナに収まるようにスケーリング
      const scale = Math.min(
        containerWidth / BASE_WIDTH,
        containerHeight / BASE_HEIGHT
      );

      setImageSize({
        width: BASE_WIDTH * scale,
        height: BASE_HEIGHT * scale
      });
    };

    updateImageSize();
    setImageLoaded(true);

    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(updateImageSize);
    }
    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      setImageLoaded(false);
      setImageSize(null);
    };
  }, [isOpen, imageUrl]);

  const getCustomerPosition = (customer: typeof customers[0]) => {
    if (!imageSize) return { x: 0, y: 0 };

    // 画像の実際のサイズに基づいてスケーリング
    const scaleX = imageSize.width / BASE_WIDTH;
    const scaleY = imageSize.height / BASE_HEIGHT;
    
    return {
      x: customer.xCoordinate * scaleX,
      y: customer.yCoordinate * scaleY
    };
  };

  const getNamePosition = (position: { x: number; y: number }, imageSize: { width: number; height: number }) => {
    const MARGIN = 8;
    
    // 上下左右の空きスペースを計算
    const spaceAbove = position.y;
    const spaceBelow = imageSize.height - position.y;
    const spaceLeft = position.x;
    const spaceRight = imageSize.width - position.x;

    // 最も空きスペースがある方向を選択
    const spaces = [
      { direction: 'top', space: spaceAbove },
      { direction: 'bottom', space: spaceBelow },
      { direction: 'left', space: spaceLeft },
      { direction: 'right', space: spaceRight }
    ];

    return spaces.reduce((prev, current) => 
      current.space > prev.space ? current : prev
    ).direction;
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-[90vh] max-w-6xl flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-800">
              店舗レイアウト
            </h2>
            {selectedCustomer && (
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span>{selectedCustomer.name}様</span>
                <span className="px-2 py-1 bg-gray-100 rounded">
                  X: {selectedCustomer.xCoordinate}, Y: {selectedCustomer.yCoordinate}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div 
          ref={containerRef}
          className="flex-1 overflow-hidden bg-gray-100 p-4"
        >
          {imageUrl && imageSize ? (
            <div className="w-full h-full flex items-center justify-center">
              <div 
                ref={imageRef}
                className="relative bg-white"
                style={{ 
                  width: `${imageSize.width}px`,
                  height: `${imageSize.height}px`
                }}
              >
                <Image
                  src={imageUrl}
                  alt="店舗レイアウト"
                  fill
                  priority
                  className="object-contain"
                  style={{ display: imageLoaded ? 'block' : 'none' }}
                  onLoadingComplete={() => setImageLoaded(true)}
                  unoptimized={imageUrl.startsWith('data:')}
                />
                {imageLoaded && customers.map((customer) => {
                  const isSelected = customer.id === selectedCustomerId;
                  const position = getCustomerPosition(customer);
                  const namePosition = getNamePosition(position, imageSize);
                  
                  return (
                    <div
                      key={`${customer.id}-${isSelected}`}
                      className={`absolute z-10 ${isSelected ? 'z-20' : ''}`}
                      style={{
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="relative">
                        <div
                          className={`w-4 h-4 rounded-full ${
                            isSelected
                              ? 'bg-red-500 ring-2 ring-red-300 ring-opacity-50'
                              : 'bg-blue-500'
                          }`}
                        />
                        <div 
                          className={`absolute whitespace-nowrap ${
                            namePosition === 'top' ? 'bottom-full mb-2 left-1/2 -translate-x-1/2' :
                            namePosition === 'bottom' ? 'top-full mt-2 left-1/2 -translate-x-1/2' :
                            namePosition === 'left' ? 'right-full mr-2 top-1/2 -translate-y-1/2' :
                            'left-full ml-2 top-1/2 -translate-y-1/2'
                          }`}
                        >
                          <div className={`px-2 py-1 text-xs rounded shadow-lg border ${
                            isSelected
                              ? 'bg-red-50 border-red-300 text-red-800'
                              : 'bg-white border-gray-200 text-gray-800'
                          }`}>
                            {customer.name}様
                            {isSelected && (
                              <div className="text-gray-500">
                                ({customer.xCoordinate}, {customer.yCoordinate})
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              レイアウト画像が見つかりません
            </div>
          )}
        </div>
      </div>
    </div>
  );
}