import axios, { AxiosInstance, AxiosError } from 'axios';
import { Customer } from '../types/customer';
import { Category } from '../types/category';
import { Menu } from '../types/menu';
import { OrderItem } from '../types/order';
import https from 'https';

// カスタム HTTPS エージェントを作成
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 3000,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 30000,
});

// axios インスタンスを作成
const axiosInstance: AxiosInstance = axios.create({
  timeout: 30000,
  validateStatus: status => status >= 200 && status < 300,
  maxRedirects: 5,
  httpsAgent,
  headers: {
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=30, max=100'
  }
});

// 構成を再試行するための設定
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  shouldRetry: (error: AxiosError) => {
    const status = error.response?.status;
    return (
      !status || // Network errors have no status
      status === 408 || // Request Timeout
      status === 429 || // Too Many Requests
      status === 500 || // Internal Server Error
      status === 502 || // Bad Gateway
      status === 503 || // Service Unavailable
      status === 504 || // Gateway Timeout
      error.code === 'ECONNABORTED' ||
      error.message.includes('socket hang up')
    );
  }
};

// 接続エラー処理のための応答インターセプターを追加
axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    if (!axios.isAxiosError(error) || !error.config || error.config.retry) {
      return Promise.reject(error);
    }

    let retryCount = 0;
    const shouldRetry = RETRY_CONFIG.shouldRetry(error);

    if (shouldRetry && retryCount < RETRY_CONFIG.maxRetries) {
      error.config.retry = true;
      retryCount++;

      const delayMs = Math.min(
        RETRY_CONFIG.initialDelayMs * Math.pow(2, retryCount),
        RETRY_CONFIG.maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
      return axiosInstance(error.config);
    }

    return Promise.reject(error);
  }
);

// 座標更新のためのキュー
class CoordinateUpdateQueue {
  private queue: Map<string, {
    x: number;
    y: number;
    timer: NodeJS.Timeout;
    promise: Promise<void>;
    resolve: (value: void | PromiseLike<void>) => void;
    reject: (reason?: any) => void;
  }> = new Map();

  private debounceTime = 500; // 500ms debounce
  private maxRetries = 3;
  private retryDelay = 1000;

  async update(customerId: string, x: number, y: number): Promise<void> {
    // 座標のアップデートがある場合はクリア
    const existing = this.queue.get(customerId);
    if (existing) {
      clearTimeout(existing.timer);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        try {
          let attempts = 0;
          while (attempts < this.maxRetries) {
            try {
              const response = await axiosInstance.patch(
                `/api/customers/${customerId}/coordinates`,
                { xCoordinate: x, yCoordinate: y }
              );

              if (response.data.success) {
                this.queue.delete(customerId);
                resolve();
                return;
              }
              throw new Error('Update failed');
            } catch (error) {
              attempts++;
              if (attempts === this.maxRetries) {
                throw error;
              }
              await new Promise(r => setTimeout(r, this.retryDelay * Math.pow(2, attempts)));
            }
          }
        } catch (error) {
          this.queue.delete(customerId);
          reject(error);
        }
      }, this.debounceTime);

      this.queue.set(customerId, {
        x,
        y,
        timer,
        promise: new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        }),
        resolve,
        reject
      });
    });
  }
}

const coordinateUpdateQueue = new CoordinateUpdateQueue();

// エラー処理のためのヘルパー関数
export async function fetchCustomers(): Promise<Customer[]> {
  try {
    const response = await axiosInstance.get('/api/customers');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching customers:', error);
    return [];
  }
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const response = await axiosInstance.get('/api/categories');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export async function fetchMenus(categoryId: string): Promise<Menu[]> {
  try {
    const response = await axiosInstance.get(`/api/menus?categoryId=${categoryId}`);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching menus:', error);
    return [];
  }
}

export async function fetchFoods(): Promise<Menu[]> {
  try {
    const response = await axiosInstance.get('/api/foods');
    return response.data || [];
  } catch (error) {
    console.error('Error fetching foods:', error);
    return [];
  }
}

export async function fetchLayout(): Promise<{
  imageUrl: string;
  title: string;
  fileType: string;
}> {
  try {
    const response = await axiosInstance.get('/api/layout');
    return response.data;
  } catch (error) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.details || error.message
      : error instanceof Error
        ? error.message
        : 'レイアウト情報の取得に失敗しました';

    console.error('Error fetching layout:', {
      message: errorMessage,
      status: axios.isAxiosError(error) ? error.response?.status : undefined
    });

    throw new Error(errorMessage);
  }
}

export async function createTeichaOrder(orderItem: OrderItem, customer: Customer): Promise<void> {
  let retries = 0;
  const maxRetries = 3;
  const retryDelay = 1000;

  while (retries < maxRetries) {
    try {
      const orderDate = new Date().toISOString().split('T')[0];

      const orderRecord = {
        Order__c: orderItem.drinkMenu?.id || orderItem.foodMenu?.id,
        RaitenChipWork__c: customer.id,
        Kosu__c: 1,
        Chumonbi__c: orderDate,
        MotikaeriFLG__c: orderItem.foodMenu ? !orderItem.isEatIn : false,
        ...(orderItem.foodMenu && { Omotenasi__c: orderItem.foodMenu.name })
      };

      await axiosInstance.post('/api/orders/teicha', orderRecord);
      return;
    } catch (error) {
      if (retries === maxRetries - 1) {
        throw error;
      }
      retries++;
      await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, retries)));
    }
  }
}

export async function updateCustomerCoordinates(
  customerId: string,
  x: number,
  y: number
): Promise<void> {
  return coordinateUpdateQueue.update(customerId, x, y);
}