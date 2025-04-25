import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';

// Create axios instance with optimized settings
const axiosInstance = axios.create({
  timeout: 30000,
  maxRedirects: 5,
  headers: {
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=30, max=100'
  }
});

// Add retry logic for failed requests
async function retryRequest(fn: () => Promise<any>, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      if (axios.isAxiosError(error) && error.response?.status === 401) throw error;
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      
      // Reset connection for next attempt
      if (axios.isAxiosError(error) && error.message.includes('socket hang up')) {
        axiosInstance.defaults.headers['Connection'] = 'close';
        await new Promise(resolve => setTimeout(resolve, 1000));
        axiosInstance.defaults.headers['Connection'] = 'keep-alive';
      }
    }
  }
  throw new Error('All retry attempts failed');
}

export async function PATCH(
  request: Request,
  { params }: { params: { customerId: string } }
) {
  try {
    const cookieStore = cookies();
    const body = await request.json();
    
    const token = await getToken({
      req: {
        cookies: Object.fromEntries(
          cookieStore.getAll().map(cookie => [cookie.name, cookie.value])
        ),
        headers: {
          'host': 'localhost:3000',
          'cookie': cookieStore.toString()
        }
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.accessToken || !token?.instanceUrl) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing required token information' },
        { status: 401 }
      );
    }

    const { xCoordinate, yCoordinate } = body;
    if (
      typeof xCoordinate !== 'number' || 
      typeof yCoordinate !== 'number' ||
      xCoordinate < 0 || 
      xCoordinate > 100 ||
      yCoordinate < 0 || 
      yCoordinate > 100
    ) {
      return NextResponse.json(
        { error: 'Bad Request', details: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    const response = await retryRequest(async () => {
      return axiosInstance({
        method: 'patch',
        url: `${token.instanceUrl}/services/data/v58.0/sobjects/TE_RaitenChipWork__c/${params.customerId}`,
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json'
        },
        data: {
          Xzahyo__c: xCoordinate,
          Yzahyo__c: yCoordinate
        }
      });
    });

    if (response.status === 204) {
      return NextResponse.json({ 
        success: true,
        data: {
          customerId: params.customerId,
          xCoordinate,
          yCoordinate
        }
      });
    }

    throw new Error('Unexpected response from Salesforce');
  } catch (error) {
    console.error('Error updating customer coordinates:', error);
    
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const details = error.response?.data || error.message;
      
      if (status === 401) {
        return NextResponse.json(
          { error: 'Unauthorized', details },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { error: 'Salesforce API Error', details },
        { status }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal Server Error', details: 'Failed to update coordinates' },
      { status: 500 }
    );
  }
}