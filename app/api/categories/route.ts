import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';

export async function GET() {
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

    // カテゴリー情報を取得（参照関係を使用）
    const query = `
      SELECT 
        Id, 
        Name, 
        Sort__c,
        Tenpo__r.Id
      FROM TE_TeichaCategory__c
      WHERE
        YukoFlg__c = true
        AND Tenpo__r.Id = '${token.shozokuTenpoId}'
      ORDER BY 
        Sort__c ASC NULLS LAST,
        Name ASC
    `.trim();

    console.log('Executing categories query:', query);

    const response = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v58.0/query`,
      params: { q: query },
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Categories response:', JSON.stringify(response.data, null, 2));

    if (!response.data.records) {
      const errorMessage = 'Invalid response from Salesforce';
      console.error('Unexpected Salesforce response format:', {
        error: errorMessage,
        response: JSON.stringify(response.data)
      });
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

    const categories = response.data.records.map((record: any) => ({
      id: record.Id,
      name: record.Name,
      sort: record.Sort__c
    }));

    return NextResponse.json(categories);
  } catch (error) {
    const errorInfo = {
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(axios.isAxiosError(error) ? {
        status: error.response?.status,
        data: error.response?.data
      } : {})
    };
    console.error('Error in /api/categories:', errorInfo);
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorInfo },
      { status: 500 }
    );
  }
}