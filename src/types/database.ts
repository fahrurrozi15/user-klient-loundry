export type ServiceType = 'kiloan' | 'satuan' | 'express';

export interface ServicePackage {
  id: string;
  name: string;
  slug: string;
  description: string;
  service_type: ServiceType;
  price_per_unit: number;
  unit_name: string;
  estimated_duration_hours: number;
  is_active: boolean;
  created_at?: string;
}

export type OrderStatus =
  | 'ORDER_RECEIVED'
  | 'COURIER_PICKUP'
  | 'IN_LAUNDRY'
  | 'WASHING_DRYING'
  | 'IRONING'
  | 'READY_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export type DeliveryType = 'pickup_delivery' | 'dropoff_pickup' | 'pickup_only';
export type PaymentMethod = 'CASH' | 'QRIS';
export type PaymentStatus = 'UNPAID' | 'PAID';

export interface ClientOrder {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_type: DeliveryType;
  service_package_id?: string;
  service_name: string;
  estimated_weight_kg: number;
  customer_notes?: string;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  total_amount?: number;
  actual_weight_kg?: number;
  piece_count?: number;
  payment_proof_url?: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderTracking {
  id: string;
  order_id: string;
  order_code: string;
  status: OrderStatus;
  status_title: string;
  description?: string;
  created_at: string;
}
