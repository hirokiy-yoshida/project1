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

    // 来店客情報を取得（参照関係を使用）
    const query = `
      SELECT 
        Id, 
        RaitenshaMei__c, 
        RaitenNichiji__c, 
        RaitenNinzu__c, 
        Xzahyo__c, 
        Yzahyo__c,
        Tenpo__r.Id
      FROM TE_RaitenChipWork__c
      WHERE
        RaitenNichiji__c = TODAY
        AND VisitedFlg__c = true
        AND TaitenZumi__c = false
        AND AzukariFlg__c = false
        AND Tenpo__r.Id = '${token.shozokuTenpoId}'
      ORDER BY RaitenNichiji__c ASC
    `.trim();

    console.log('Executing customer query:', query);

    const response = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v58.0/query`,
      params: { q: query },
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Customer response:', JSON.stringify(response.data, null, 2));

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

    const customers = response.data.records.map((record: any) => ({
      id: record.Id,
      name: record.RaitenshaMei__c,
      visitDateTime: record.RaitenNichiji__c,
      numberOfGuests: record.RaitenNinzu__c || 0,
      xCoordinate: record.Xzahyo__c || 0,
      yCoordinate: record.Yzahyo__c || 0,
    }));

    return NextResponse.json(customers);
  } catch (error) {
    const errorInfo = {
      message: error instanceof Error ? error.message : 'Unknown error',
      ...(axios.isAxiosError(error) ? {
        status: error.response?.status,
        data: error.response?.data
      } : {})
    };
    console.error('Error in /api/customers:', errorInfo);
    return NextResponse.json(
      { error: 'Internal Server Error', details: errorInfo },
      { status: 500 }
    );
  }
}