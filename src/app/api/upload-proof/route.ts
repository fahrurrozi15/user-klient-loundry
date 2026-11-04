import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseAdmin = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderCode, imageBase64 } = body;

    if (!orderCode || !imageBase64) {
      return NextResponse.json(
        { success: false, message: 'orderCode dan imageBase64 wajib diisi.' },
        { status: 400 }
      );
    }

    const cleanCode = String(orderCode).trim().toUpperCase();

    // 1. Ekstrak data binary dan MIME type dari Data URL base64
    let buffer: Buffer;
    let contentType = 'image/jpeg';
    let fileExtension = 'jpg';

    if (imageBase64.startsWith('data:')) {
      const matches = imageBase64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contentType = matches[1];
        if (contentType.includes('png')) fileExtension = 'png';
        else if (contentType.includes('webp')) fileExtension = 'webp';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        const commaIdx = imageBase64.indexOf(',');
        buffer = Buffer.from(commaIdx > -1 ? imageBase64.slice(commaIdx + 1) : imageBase64, 'base64');
      }
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, message: 'Supabase admin client tidak terkonfigurasi di server.' },
        { status: 500 }
      );
    }

    // 2. Unggah file gambar ke Supabase Storage bucket 'payment-proofs'
    const fileName = `proofs/${cleanCode}_${Date.now()}.${fileExtension}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('payment-proofs')
      .upload(fileName, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      return NextResponse.json(
        { success: false, message: `Gagal upload ke storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 3. Dapatkan URL Publik permanen dari Supabase Storage
    const { data: pubData } = supabaseAdmin.storage
      .from('payment-proofs')
      .getPublicUrl(uploadData.path || fileName);

    const publicUrl = pubData.publicUrl;

    // 4. Update data order di tabel client_orders
    const { error: updateOrderError } = await supabaseAdmin
      .from('client_orders')
      .update({
        payment_proof_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('order_code', cleanCode);

    if (updateOrderError) {
      console.warn('Warning updating client_orders table:', updateOrderError.message);
    }

    // 5. Simpan juga ke app_settings sebagai fail-safe sinkronisasi
    try {
      await supabaseAdmin.from('app_settings').upsert([
        {
          key: `proof_${cleanCode}`,
          value: publicUrl,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      console.warn('Warning updating app_settings fallback:', e);
    }

    // 6. Catat log pelacakan di tabel order_tracking
    try {
      const { data: orderData } = await supabaseAdmin
        .from('client_orders')
        .select('id')
        .eq('order_code', cleanCode)
        .maybeSingle();

      if (orderData?.id) {
        await supabaseAdmin.from('order_tracking').insert([
          {
            order_id: orderData.id,
            order_code: cleanCode,
            status: 'IN_LAUNDRY',
            status_title: 'Bukti Pembayaran Terkirim',
            description: 'Foto bukti pembayaran QRIS telah disimpan ke Supabase Storage. Menunggu konfirmasi kasir.',
          },
        ]);
      }
    } catch (e) {
      console.warn('Warning inserting order_tracking:', e);
    }

    return NextResponse.json({
      success: true,
      publicUrl,
      fileName,
      message: 'Foto bukti pembayaran berhasil disimpan ke Supabase Storage.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Upload proof API error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
