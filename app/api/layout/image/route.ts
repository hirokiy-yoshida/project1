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

    // 1.ボード設定レコードを取得
    const settingsQuery = `
      SELECT Id
      FROM TE_TenpoKanriBoardSetting__c 
      WHERE SetteiSakiTenpo__c = '${token.shozokuTenpoId}'
      LIMIT 1
    `.trim();

    const settingsResponse = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v59.0/query`,
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      },
      params: { q: settingsQuery }
    });

    if (!settingsResponse.data.records?.length) {
      return NextResponse.json(
        { error: 'Not Found', details: 'No board settings found for this store' },
        { status: 404 }
      );
    }

    const settingId = settingsResponse.data.records[0].Id;

    // 2.最新の ContentVersion を取得
    const contentVersionQuery = `
      SELECT 
        Id,
        Title,
        FileType,
        ContentDocumentId,
        CreatedDate,
        Description,
        VersionData
      FROM ContentVersion
      WHERE FirstPublishLocationId = '${settingId}'
      AND IsLatest = true
      AND FileType IN ('PNG', 'JPG', 'JPEG')
      ORDER BY CreatedDate DESC
      LIMIT 1
    `.trim();

    const contentVersionResponse = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v59.0/query`,
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json'
      },
      params: { q: contentVersionQuery }
    });

    if (!contentVersionResponse.data.records?.length) {
      return NextResponse.json(
        { error: 'Not Found', details: 'No valid image version found for this layout' },
        { status: 404 }
      );
    }

    const versionRecord = contentVersionResponse.data.records[0];

    // 3.画像データ（レイアウト）を取得
    const imageResponse = await axios({
      method: 'get',
      url: `${token.instanceUrl}/services/data/v59.0/sobjects/ContentVersion/${versionRecord.Id}/VersionData`,
      headers: {
        'Authorization': `Bearer ${token.accessToken}`
      },
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const contentType = `image/${versionRecord.FileType.toLowerCase()}`;
    const base64Image = Buffer.from(imageResponse.data).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64Image}`;

    return NextResponse.json({
      imageUrl: dataUrl,
      title: versionRecord.Title,
      fileType: versionRecord.FileType,
      description: versionRecord.Description,
      createdDate: versionRecord.CreatedDate,
      contentDocumentId: versionRecord.ContentDocumentId
    });

  } catch (error) {
    console.error('Error fetching layout image:', error);

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
      { error: 'Internal Server Error', details: 'Failed to fetch layout image' },
      { status: 500 }
    );
  }
}