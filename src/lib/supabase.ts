import { createClient } from '@supabase/supabase-js';
import { ServicePackage, ClientOrder, OrderTracking } from '@/types/database';
import { INITIAL_SERVICES, SAMPLE_ORDERS, SAMPLE_TRACKING } from './mock-data';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-client-project')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helpers Data Service dengan Fallback Mock Data
export async function getServicePackages(): Promise<ServicePackage[]> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('service_packages')
        .select('*')
        .eq('is_active', true)
        .order('price_per_unit', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as ServicePackage[];
      }
    } catch (e) {
      console.warn('Gagal fetch services dari Supabase, menggunakan data lokal:', e);
    }
  }
  return INITIAL_SERVICES;
}

export async function createClientOrder(payload: {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_type: 'pickup_delivery' | 'dropoff_pickup' | 'pickup_only';
  service_package_id?: string;
  service_name: string;
  estimated_weight_kg?: number;
  payment_method?: 'CASH' | 'QRIS';
  customer_notes?: string;
}): Promise<{ success: boolean; order_code: string; message?: string }> {
  // Generate Kode Resi: LND-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const order_code = `LND-${dateStr}-${randomSuffix}`;
  const payment_method = payload.payment_method || 'CASH';

  if (isSupabaseConfigured && supabase) {
    try {
      const orderPayload: Record<string, unknown> = {
        order_code,
        customer_name: payload.customer_name,
        customer_phone: payload.customer_phone,
        customer_address: payload.customer_address,
        delivery_type: payload.delivery_type,
        service_package_id: payload.service_package_id,
        service_name: payload.service_name,
        estimated_weight_kg: payload.estimated_weight_kg || 0,
        customer_notes: payload.customer_notes || '',
        payment_method,
        payment_status: 'UNPAID',
        status: 'ORDER_RECEIVED',
      };

      const { data, error } = await supabase
        .from('client_orders')
        .insert([orderPayload])
        .select()
        .single();

      if (error) {
        // Jika kolom payment_method belum di-alter di DB, coba tanpa kolom tersebut
        if (error.message.includes('column') || error.message.includes('payment_method')) {
          delete orderPayload.payment_method;
          delete orderPayload.payment_status;
          orderPayload.customer_notes = `${payload.customer_notes || ''} [Metode Bayar: ${payment_method}]`;
          const retry = await supabase.from('client_orders').insert([orderPayload]).select().single();
          if (!retry.error && retry.data) {
            return { success: true, order_code: retry.data.order_code };
          }
        }
        console.error('Supabase insert order error:', error);
        return { success: false, order_code: '', message: error.message };
      }

      return { success: true, order_code: data.order_code };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error submitting order to Supabase:', err);
      return { success: false, order_code: '', message: errMsg };
    }
  }

  // Fallback Local Storage Mode (bila Supabase belum terhubung)
  if (typeof window !== 'undefined') {
    const localOrders: ClientOrder[] = JSON.parse(localStorage.getItem('local_client_orders') || '[]');
    const newOrder: ClientOrder = {
      id: `local-${Date.now()}`,
      order_code,
      customer_name: payload.customer_name,
      customer_phone: payload.customer_phone,
      customer_address: payload.customer_address,
      delivery_type: payload.delivery_type,
      service_package_id: payload.service_package_id,
      service_name: payload.service_name,
      estimated_weight_kg: payload.estimated_weight_kg || 0,
      customer_notes: payload.customer_notes || '',
      payment_method,
      payment_status: 'UNPAID',
      status: 'ORDER_RECEIVED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localOrders.unshift(newOrder);
    localStorage.setItem('local_client_orders', JSON.stringify(localOrders));

    // Simpan local tracking
    const localTracking = JSON.parse(localStorage.getItem('local_tracking') || '{}');
    localTracking[order_code] = [
      {
        id: `trk-${Date.now()}`,
        order_id: newOrder.id,
        order_code,
        status: 'ORDER_RECEIVED',
        status_title: 'Pesanan Diterima Sistem',
        description: payment_method === 'QRIS'
          ? 'Pesanan terdaftar. Menunggu timbangan outlet untuk kalkulasi total tagihan QRIS.'
          : 'Pesanan berhasil terdaftar, menunggu verifikasi kasir atau penjemputan.',
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem('local_tracking', JSON.stringify(localTracking));
  }

  return { success: true, order_code };
}

export async function getOrderTrackingByCode(
  orderCode: string
): Promise<{ order: ClientOrder | null; tracking: OrderTracking[] }> {
  const code = orderCode.trim().toUpperCase();

  // 1. Ambil bukti pembayaran dari localStorage jika ada
  let localProofBackup: string | null = null;
  if (typeof window !== 'undefined') {
    localProofBackup = localStorage.getItem(`proof_${code}`);
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('client_orders')
        .select('*')
        .eq('order_code', code)
        .maybeSingle();

      if (!orderError && orderData) {
        // Jika kolom payment_proof_url kosong di client_orders, cek di app_settings
        let finalProofUrl = (orderData as ClientOrder).payment_proof_url;
        if (!finalProofUrl) {
          try {
            const { data: settingProof } = await supabase
              .from('app_settings')
              .select('value')
              .eq('key', `proof_${code}`)
              .maybeSingle();
            if (settingProof?.value) {
              finalProofUrl = settingProof.value;
            }
          } catch (e) {
            console.warn('Gagal cek proof di app_settings:', e);
          }
        }

        if (!finalProofUrl && localProofBackup) {
          finalProofUrl = localProofBackup;
        }

        const enrichedOrder = {
          ...(orderData as ClientOrder),
          payment_proof_url: finalProofUrl,
        };

        const { data: trackingData } = await supabase
          .from('order_tracking')
          .select('*')
          .eq('order_code', code)
          .order('created_at', { ascending: true });

        return {
          order: enrichedOrder,
          tracking: (trackingData || []) as OrderTracking[],
        };
      }
    } catch (e) {
      console.warn('Error reading from Supabase:', e);
    }
  }

  // Fallback Check in Local Storage
  if (typeof window !== 'undefined') {
    const localOrders: ClientOrder[] = JSON.parse(localStorage.getItem('local_client_orders') || '[]');
    const foundLocal = localOrders.find((o) => o.order_code.toUpperCase() === code);
    if (foundLocal) {
      if (!foundLocal.payment_proof_url && localProofBackup) {
        foundLocal.payment_proof_url = localProofBackup;
      }
      const localTracking = JSON.parse(localStorage.getItem('local_tracking') || '{}');
      return {
        order: foundLocal,
        tracking: localTracking[code] || [],
      };
    }
  }

  // Fallback Check in Sample Data
  const foundSample = SAMPLE_ORDERS.find((o) => o.order_code.toUpperCase() === code);
  if (foundSample) {
    if (!foundSample.payment_proof_url && localProofBackup) {
      foundSample.payment_proof_url = localProofBackup;
    }
    return {
      order: foundSample,
      tracking: SAMPLE_TRACKING[code] || [],
    };
  }

  return { order: null, tracking: [] };
}

export interface ClientQRIS {
  merchant_name: string;
  image_url: string;
  nmid?: string;
  info?: string;
}

export const DEFAULT_CLIENT_QRIS: ClientQRIS = {
  merchant_name: 'AURA LAUNDRY OFFICIAL',
  image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=00020101021226600016ID.CO.SHOPEE.WWW01189360091800000000000215ID10203040506010303UME51440014ID.CO.QRIS.WWW0215ID10203040506010303UME5204581253033605802ID5921AURA%20LAUNDRY%20OFFICIAL6007JAKARTA61051216062070703A0163041A2B',
  nmid: 'ID102030405060',
  info: 'Scan QRIS menggunakan GoPay, OVO, Dana, ShopeePay, BCA, Mandiri Livin, dll.',
};

export async function getClientQRIS(): Promise<ClientQRIS> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (!error && data && data.length > 0) {
        const map = new Map<string, string>();
        data.forEach((row: { key: string; value: string }) => map.set(row.key, row.value));
        return {
          merchant_name: map.get('qris_merchant_name') || DEFAULT_CLIENT_QRIS.merchant_name,
          image_url: map.get('qris_image_url') || DEFAULT_CLIENT_QRIS.image_url,
          nmid: map.get('qris_nmid') || DEFAULT_CLIENT_QRIS.nmid,
          info: map.get('qris_info') || DEFAULT_CLIENT_QRIS.info,
        };
      }
    } catch (e) {
      console.warn('Gagal fetch QRIS di client app:', e);
    }
  }

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('aura_qris_settings');
    if (saved) return JSON.parse(saved);
  }

  return DEFAULT_CLIENT_QRIS;
}

/**
 * Helper Kompresi Gambar agar ringan (~80KB) dan tidak pernah gagal kirim
 */
export function compressImageFile(file: File, maxWidth = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Bukan file gambar.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Unggah file gambar ke Supabase Storage Bucket
 * Mengembalikan URL publik file atau null jika gagal/offline
 */
export async function uploadImageToSupabaseStorage(
  bucket: string,
  fileName: string,
  base64OrBlob: string | Blob,
  contentType: string = 'image/jpeg'
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    let fileBody: Blob;
    if (typeof base64OrBlob === 'string') {
      const res = await fetch(base64OrBlob);
      fileBody = await res.blob();
    } else {
      fileBody = base64OrBlob;
    }

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBody, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn(`Supabase Storage upload warning (${bucket}/${fileName}):`, error.message);
      return null;
    }

    if (data) {
      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);
      return publicUrlData?.publicUrl || null;
    }
  } catch (err) {
    console.warn(`Supabase Storage upload exception (${bucket}):`, err);
  }
  return null;
}

/**
 * Unggah Bukti Pembayaran (Transfer Proof) oleh Pelanggan ke Supabase Storage
 */
export async function uploadPaymentProof(
  orderCode: string,
  proofUrl: string
): Promise<{ success: boolean; message?: string; publicUrl?: string }> {
  const code = orderCode.trim().toUpperCase();
  let finalProofUrl = proofUrl;

  // 1. Prioritas Utama: Unggah melalui Next.js API Server Route (menggunakan Supabase Secret Key ke bucket 'payment-proofs')
  if (typeof window !== 'undefined') {
    try {
      const apiRes = await fetch('/api/upload-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderCode: code, imageBase64: proofUrl }),
      });

      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json.success && json.publicUrl) {
          finalProofUrl = json.publicUrl;
          try {
            localStorage.setItem(`proof_${code}`, finalProofUrl);
          } catch {}
          return { success: true, message: json.message, publicUrl: finalProofUrl };
        }
      }
    } catch (apiErr) {
      console.warn('API /api/upload-proof fetch warning, fallback ke direct/storage client:', apiErr);
    }
  }

  // 2. Direct Supabase Storage upload fallback jika server route tidak terjangkau
  if (isSupabaseConfigured && supabase) {
    try {
      const storageUrl = await uploadImageToSupabaseStorage(
        'payment-proofs',
        `proofs/${code}_${Date.now()}.jpg`,
        proofUrl,
        'image/jpeg'
      );
      if (storageUrl) {
        finalProofUrl = storageUrl;
      }
    } catch (e) {
      console.warn('Gagal upload ke Supabase Storage, menggunakan base64 fallback:', e);
    }
  }

  // 3. Simpan selalu ke localStorage sebagai fail-safe langsung
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`proof_${code}`, finalProofUrl);
    } catch (e) {
      console.warn('LocalStorage proof set warning:', e);
    }
  }

  if (isSupabaseConfigured && supabase) {
    try {
      // A. Simpan bukti transfer ke client_orders
      const { error: updateError } = await supabase
        .from('client_orders')
        .update({
          payment_proof_url: finalProofUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('order_code', code);

      if (updateError) {
        console.warn('Gagal update payment_proof_url di client_orders Supabase:', updateError.message);
      }

      // B. Simpan juga ke app_settings sebagai backup handal (bebas batasan RLS)
      try {
        await supabase.from('app_settings').upsert([
          {
            key: `proof_${code}`,
            value: finalProofUrl,
            updated_at: new Date().toISOString(),
          },
        ]);
      } catch (errSettings) {
        console.warn('Gagal backup proof ke app_settings:', errSettings);
      }

      // C. Catat riwayat di order_tracking
      const { data: orderData } = await supabase
        .from('client_orders')
        .select('id')
        .eq('order_code', code)
        .maybeSingle();

      if (orderData?.id) {
        await supabase.from('order_tracking').insert([
          {
            order_id: orderData.id,
            order_code: code,
            status: 'IN_LAUNDRY',
            status_title: 'Bukti Pembayaran Terkirim',
            description: 'Pelanggan telah berhasil mengunggah bukti transfer QRIS. Kasir akan segera memverifikasi pembayaran.',
          },
        ]);
      }
    } catch (e: unknown) {
      console.warn('Error upload payment proof to Supabase:', e);
    }
  }

  // Fallback Local Storage
  if (typeof window !== 'undefined') {
    // Update local client orders
    const localOrders: ClientOrder[] = JSON.parse(localStorage.getItem('local_client_orders') || '[]');
    const target = localOrders.find((o) => o.order_code.toUpperCase() === code);
    if (target) {
      target.payment_proof_url = proofUrl;
      target.updated_at = new Date().toISOString();
      localStorage.setItem('local_client_orders', JSON.stringify(localOrders));
    }

    // Update local operational orders (agar admin langsung melihat jika satu browser)
    const adminOrders = JSON.parse(localStorage.getItem('local_operational_orders') || '[]');
    const adminTarget = adminOrders.find((o: { order_code: string }) => o.order_code.toUpperCase() === code);
    if (adminTarget) {
      adminTarget.payment_proof_url = proofUrl;
      localStorage.setItem('local_operational_orders', JSON.stringify(adminOrders));
    }

    // Update local tracking
    const localTracking = JSON.parse(localStorage.getItem('local_tracking') || '{}');
    if (!localTracking[code]) localTracking[code] = [];
    localTracking[code].push({
      id: `trk-proof-${Date.now()}`,
      order_id: target?.id || 'local-id',
      order_code: code,
      status: 'IN_LAUNDRY',
      status_title: 'Bukti Pembayaran Terkirim',
      description: 'Pelanggan telah berhasil mengunggah bukti transfer QRIS. Kasir akan segera memverifikasi pembayaran.',
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('local_tracking', JSON.stringify(localTracking));
  }

  return { success: true };
}

/**
 * AUTO REFRESH DI CLIENT APP
 * Memantau pembaruan status dan katalog tanpa reload
 */
export function subscribeToClientUpdates(onChange: () => void): () => void {
  const unsubscribers: (() => void)[] = [];

  // Polling fallback 3.5 detik (silent auto-refresh)
  const timer = setInterval(() => {
    onChange();
  }, 3500);
  unsubscribers.push(() => clearInterval(timer));

  if (isSupabaseConfigured && supabase) {
    try {
      const channel = supabase
        .channel('client_realtime_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'client_orders' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_tracking' }, () => {
          onChange();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'service_packages' }, () => {
          onChange();
        })
        .subscribe();

      unsubscribers.push(() => {
        supabase?.removeChannel(channel);
      });
    } catch (e) {
      console.warn('Realtime client error:', e);
    }
  }

  return () => {
    unsubscribers.forEach((fn) => fn());
  };
}
