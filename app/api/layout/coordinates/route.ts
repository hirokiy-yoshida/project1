import { NextResponse } from 'next/server';
import axios from 'axios';
import { cookies } from 'next/headers';
import { getToken } from 'next-auth/jwt';

export async function GET(request: Request) {
  try {
    const cookieStore = cookies();

    const token = await getToken({
      req: {
        cookies: Object.fromEntries(
          cookieStore.getAll().map(cookie => [cookie.name, cookie.value])
        ),
        headers: {
          'host': request.headers.get('host') || '',
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

    // 顧客レコードから画面寸法を取得
    const query = `
      SELECT 
        Id,
        GamenSize_Haba__c,
        GamenSize_Takasa__c,
        Xzahyo__c,
        Yzahyo__c
      FROM TE_RaitenChipWork__c
      WHERE 
        RaitenNichiji__c = TODAY
        AND VisitedFlg__c = true
        AND TaitenZumi__c = false
        AND AzukariFlg__c = false
        AND Tenpo__r.Id = '${token.shozokuTenpoId}'
    `.trim();

    const response = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v59.0/query`,
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      },
      params: { q: query }
    });

    if (!response.data.records) {
      return NextResponse.json(
        { error: 'Not Found', details: 'No customer records found' },
        { status: 404 }
      );
    }

    const coordinates = response.data.records.map((record: any) => ({
      id: record.Id,
      screenWidth: record.GamenSize_Haba__c,
      screenHeight: record.GamenSize_Takasa__c,
      xCoordinate: record.Xzahyo__c || 0,
      yCoordinate: record.Yzahyo__c || 0
    }));

    return NextResponse.json(coordinates);

  } catch (error) {
    console.error('Error fetching coordinates:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 400) {
        return NextResponse.json(
          { error: 'Invalid Request', details: 'The request was invalid.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Salesforce API Error', details: error.message },
        { status: error.response?.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', details: 'Failed to fetch coordinates' },
      { status: 500 }
    );
  }
}