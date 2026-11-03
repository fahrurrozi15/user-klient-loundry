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
  customer_notes?: string;
}): Promise<{ success: boolean; order_code: string; message?: string }> {
  // Generate Kode Resi: LND-YYYYMMDD-XXXX
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const order_code = `LND-${dateStr}-${randomSuffix}`;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('client_orders')
        .insert([
          {
            order_code,
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            customer_address: payload.customer_address,
            delivery_type: payload.delivery_type,
            service_package_id: payload.service_package_id,
            service_name: payload.service_name,
            estimated_weight_kg: payload.estimated_weight_kg || 0,
            customer_notes: payload.customer_notes || '',
            status: 'ORDER_RECEIVED',
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('Supabase insert order error:', error);
        return { success: false, order_code: '', message: error.message };
      }

      return { success: true, order_code: data.order_code };
    } catch (err: any) {
      console.error('Error submitting order to Supabase:', err);
      return { success: false, order_code: '', message: err.message };
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
        description: 'Pesanan berhasil terdaftar, menunggu verifikasi kasir atau penjemputan.',
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

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('client_orders')
        .select('*')
        .eq('order_code', code)
        .maybeSingle();

      if (!orderError && orderData) {
        const { data: trackingData } = await supabase
          .from('order_tracking')
          .select('*')
          .eq('order_code', code)
          .order('created_at', { ascending: true });

        return {
          order: orderData as ClientOrder,
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
    return {
      order: foundSample,
      tracking: SAMPLE_TRACKING[code] || [],
    };
  }

  return { order: null, tracking: [] };
}
