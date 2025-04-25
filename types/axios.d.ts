import 'axios';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    retry?: boolean;
  }
}