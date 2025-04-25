import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';

// リトライAPIリクエスト
async function retryRequest<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      if (axios.isAxiosError(error) && error.response?.status === 401) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('All retry attempts failed');
}

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
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

    if (!token?.accessToken || !token?.instanceUrl || !token?.shozokuTenpoId) {
      return NextResponse.json(
        { error: 'Unauthorized', details: 'Missing required token information' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // バリデーション検証
    const requiredFields = ['Order__c', 'RaitenChipWork__c', 'Kosu__c', 'Chumonbi__c'];
    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Bad Request', details: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // 店舗IDを設定
    body.Tenpo__c = token.shozokuTenpoId;

    return await retryRequest(async () => {
      try {
        // カテゴリーIDを取得
        const menuQuery = `
          SELECT Category__c
          FROM TE_TeichaMenu__c
          WHERE Id = '${body.Order__c}'
          LIMIT 1
        `.trim();

        const menuResponse = await axios({
          method: 'get',
          url: `${token.instanceUrl}/services/data/v58.0/query`,
          params: { q: menuQuery },
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 seconds timeout
        });

        if (menuResponse.data.records.length > 0) {
          body.Category__c = menuResponse.data.records[0].Category__c;
        } else {
          return NextResponse.json(
            { error: 'Not Found', details: 'Menu item not found' },
            { status: 404 }
          );
        }

        // お客様IDを取得
        const customerQuery = `
          SELECT Okyakusama__c
          FROM TE_RaitenChipWork__c
          WHERE Id = '${body.RaitenChipWork__c}'
          LIMIT 1
        `.trim();

        const customerResponse = await axios({
          method: 'get',
          url: `${token.instanceUrl}/services/data/v58.0/query`,
          params: { q: customerQuery },
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });

        if (customerResponse.data.records.length > 0) {
          body.Okyakusama__c = customerResponse.data.records[0].Okyakusama__c;
        }

        // OrdrApp__cをtrueに設定
        body.OrdrApp__c = true;

        // 呈茶レコードを作成
        const response = await axios({
          method: 'post',
          url: `${token.instanceUrl}/services/data/v58.0/sobjects/TE_Teicha__c`,
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
            'Content-Type': 'application/json'
          },
          data: body,
          timeout: 30000 // タイムアウト（30秒）
        });

        if (!response.data.success) {
          throw new Error('Failed to create Teicha record');
        }

        return NextResponse.json(response.data);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status || 500;
          const errorDetails = error.response?.data || error.message;

          console.error('Salesforce API error:', {
            status,
            details: errorDetails,
            config: {
              url: error.config?.url,
              method: error.config?.method,
              headers: error.config?.headers
            }
          });

          return NextResponse.json(
            { error: 'Salesforce API Error', details: errorDetails },
            { status }
          );
        }

        throw error;
      }
    });
  } catch (error) {
    console.error('Error in /api/orders/teicha:', error);

    const errorResponse = {
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    };

    return NextResponse.json(
      errorResponse,
      { status: 500 }
    );
  }
}