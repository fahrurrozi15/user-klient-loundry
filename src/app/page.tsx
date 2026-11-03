'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  PackageCheck,
  Search,
  Truck,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  Copy,
  ExternalLink,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { ServicePackage, ClientOrder, OrderTracking, OrderStatus } from '@/types/database';
import { getServicePackages, createClientOrder, getOrderTrackingByCode, isSupabaseConfigured } from '@/lib/supabase';

export default function ClientHomePage() {
  const [services, setServices] = useState<ServicePackage[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'kiloan' | 'satuan' | 'express'>('all');
  const [loadingServices, setLoadingServices] = useState(true);

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [deliveryType, setDeliveryType] = useState<'pickup_delivery' | 'dropoff_pickup'>('pickup_delivery');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [estimatedWeight, setEstimatedWeight] = useState<number | ''>('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderCode: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Tracking State
  const [searchCode, setSearchCode] = useState('');
  const [searchingTracking, setSearchingTracking] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<ClientOrder | null>(null);
  const [trackingTimeline, setTrackingTimeline] = useState<OrderTracking[]>([]);
  const [trackingSearched, setTrackingSearched] = useState(false);
  const [copiedResi, setCopiedResi] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoadingServices(true);
      const data = await getServicePackages();
      setServices(data);
      if (data.length > 0) {
        setSelectedServiceId(data[0].id);
      }
      setLoadingServices(false);
    }
    loadData();
  }, []);

  const filteredServices = services.filter((s) => {
    if (selectedCategory === 'all') return true;
    return s.service_type === selectedCategory;
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
      setFormError('Mohon lengkapi Nama, No. WhatsApp, dan Alamat penjemputan.');
      return;
    }

    if (!selectedService) {
      setFormError('Silakan pilih salah satu paket layanan.');
      return;
    }

    setSubmittingOrder(true);
    const result = await createClientOrder({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      delivery_type: deliveryType,
      service_package_id: selectedService.id,
      service_name: selectedService.name,
      estimated_weight_kg: Number(estimatedWeight) || 0,
      customer_notes: customerNotes,
    });

    setSubmittingOrder(false);

    if (result.success && result.order_code) {
      setOrderSuccess({ orderCode: result.order_code });
      // Reset form fields
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setEstimatedWeight('');
      setCustomerNotes('');
    } else {
      setFormError(result.message || 'Gagal mengirim pesanan. Silakan coba lagi.');
    }
  };

  const handleSearchTracking = async (codeToSearch?: string) => {
    const code = codeToSearch || searchCode;
    if (!code.trim()) return;

    setSearchingTracking(true);
    setTrackingSearched(true);
    const result = await getOrderTrackingByCode(code);
    setTrackedOrder(result.order);
    setTrackingTimeline(result.tracking);
    setSearchingTracking(false);

    // Scroll smoothly to tracking result
    const el = document.getElementById('tracking-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedResi(true);
    setTimeout(() => setCopiedResi(false), 2000);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ORDER_RECEIVED':
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Pesanan Masuk</span>;
      case 'COURIER_PICKUP':
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Penjemputan Kurir</span>;
      case 'IN_LAUNDRY':
        return <span className="bg-indigo-100 text-indigo-800 border border-indigo-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Tiba di Outlet</span>;
      case 'WASHING_DRYING':
        return <span className="bg-cyan-100 text-cyan-800 border border-cyan-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Proses Cuci</span>;
      case 'IRONING':
        return <span className="bg-teal-100 text-teal-800 border border-teal-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Setrika & Packing</span>;
      case 'READY_FOR_DELIVERY':
        return <span className="bg-purple-100 text-purple-800 border border-purple-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Siap Diantar</span>;
      case 'COMPLETED':
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Selesai</span>;
      case 'CANCELLED':
        return <span className="bg-red-100 text-red-800 border border-red-300 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider rounded">Dibatalkan</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 px-2.5 py-1 text-xs font-semibold uppercase rounded">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Notification Banner */}
      <div className="bg-slate-900 text-slate-200 text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-medium">Integrasi Sistem Portal Klien</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-300">Database: <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-400">db_client (Supabase Project 1)</code></span>
          </div>
          <div className="text-slate-400 text-[11px]">
            {isSupabaseConfigured ? '🟢 Supabase Online' : '🟡 Standby (Local Fallback Mode Aktif)'}
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-sky-600 text-white p-2 rounded">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900">AURA LAUNDRY</span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-500 uppercase tracking-widest border-l pl-2 border-slate-300">
                Client Portal
              </span>
            </div>
          </div>

          {/* Quick Resi Tracker in Navbar */}
          <div className="flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="LND-XXXXXXXX..."
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchTracking()}
                className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-600 uppercase"
              />
            </div>
            <button
              onClick={() => handleSearchTracking()}
              disabled={searchingTracking}
              className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1 shrink-0 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lacak</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold px-2.5 py-1 rounded">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              Layanan Cuci & Setrika Uap Profesional
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Pakaian Bersih, Rapi & Higienis Tanpa Ribet Keluar Rumah.
            </h1>
            <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
              Pesan penjemputan gratis ke alamat Anda. Pantau perjalanan status cucian secara transparan dari proses timbang, pencucian, setrika, hingga kembali ke lemari Anda.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#order-form"
                className="bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm px-5 py-2.5 rounded transition shadow-xs inline-flex items-center gap-2"
              >
                <Truck className="w-4 h-4" />
                Minta Penjemputan Sekarang
              </a>
              <button
                onClick={() => handleSearchTracking('LND-20261103-0001')}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-medium text-sm px-4 py-2.5 rounded transition inline-flex items-center gap-2"
              >
                <Search className="w-4 h-4 text-slate-600" />
                Coba Demo Resi
              </button>
            </div>
          </div>

          {/* Quick Value Metrics */}
          <div className="md:col-span-5 grid grid-cols-2 gap-3">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <div className="text-sky-600 font-bold text-2xl">6-8 Jam</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">Layanan Express</div>
              <div className="text-slate-500 text-xs mt-0.5">Selesai hari yang sama</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <div className="text-sky-600 font-bold text-2xl">100%</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">Higienis & Terpisah</div>
              <div className="text-slate-500 text-xs mt-0.5">1 Mesin 1 Pelanggan</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <div className="text-sky-600 font-bold text-2xl">Digital</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">Pelacakan Resi</div>
              <div className="text-slate-500 text-xs mt-0.5">Update status real-time</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <div className="text-sky-600 font-bold text-2xl">Garansi</div>
              <div className="text-xs font-semibold text-slate-900 mt-1">Setrika Uap Ulang</div>
              <div className="text-slate-500 text-xs mt-0.5">Bila kurang memuaskan</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Body */}
      <main className="max-w-6xl mx-auto px-4 py-12 flex-1 w-full space-y-16">
        
        {/* Section 1: Tracking Status Result */}
        <section id="tracking-section" className="scroll-mt-20">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Search className="w-5 h-5 text-sky-600" />
                Portal Pelacakan Resi Laundry
              </h2>
              <p className="text-slate-500 text-xs">
                Masukkan kode order (contoh: <button onClick={() => { setSearchCode('LND-20261103-0001'); handleSearchTracking('LND-20261103-0001'); }} className="text-sky-600 underline font-mono">LND-20261103-0001</button>) untuk melihat progres cucian Anda.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Nomor Resi (LND-...)"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                className="bg-white border border-slate-300 rounded px-3 py-2 text-sm w-full sm:w-64 uppercase focus:outline-none focus:border-sky-600"
              />
              <button
                onClick={() => handleSearchTracking()}
                disabled={searchingTracking}
                className="bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm px-4 py-2 rounded shrink-0 transition"
              >
                {searchingTracking ? 'Mencari...' : 'Periksa'}
              </button>
            </div>
          </div>

          {/* Tracking Card Display */}
          {trackingSearched && (
            <div className="bg-white border border-slate-200 rounded p-6 shadow-xs">
              {trackedOrder ? (
                <div className="space-y-6">
                  {/* Order Summary Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-slate-900">{trackedOrder.order_code}</span>
                        {getStatusBadge(trackedOrder.status)}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Dibuat pada: {new Date(trackedOrder.created_at).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block">Pelanggan</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.customer_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Layanan</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.service_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Estimasi Berat</span>
                        <span className="font-semibold text-slate-800">{trackedOrder.estimated_weight_kg ? `${trackedOrder.estimated_weight_kg} KG` : '-'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Horizontal / Vertical Progress Timeline */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                      Riwayat Perjalanan Cucian
                    </h3>

                    {trackingTimeline.length > 0 ? (
                      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {trackingTimeline.map((item, idx) => {
                          const isLatest = idx === trackingTimeline.length - 1;
                          return (
                            <div key={item.id || idx} className="relative">
                              <span
                                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 bg-white ${
                                  isLatest ? 'border-sky-600 bg-sky-600 ring-4 ring-sky-100' : 'border-slate-400'
                                }`}
                              />
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                <span className={`text-sm font-semibold ${isLatest ? 'text-sky-700 font-bold' : 'text-slate-800'}`}>
                                  {item.status_title}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  {new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Belum ada riwayat pergerakan status untuk order ini.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800">Nomor Resi Tidak Ditemukan</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Periksa kembali nomor resi yang Anda masukkan atau hubungi admin laundry jika pesanan baru saja dibuat.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 2: Service Packages Catalog */}
        <section id="services-catalog">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
            <div>
              <div className="text-xs font-bold text-sky-600 uppercase tracking-wider">Katalog Layanan</div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Pilihan Paket & Tarif Resmi</h2>
              <p className="text-slate-500 text-xs mt-1">Transparan, tanpa biaya tersembunyi. Timbang akurat di outlet.</p>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded text-xs font-medium">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded transition ${selectedCategory === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Semua
              </button>
              <button
                onClick={() => setSelectedCategory('kiloan')}
                className={`px-3 py-1.5 rounded transition ${selectedCategory === 'kiloan' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Kiloan
              </button>
              <button
                onClick={() => setSelectedCategory('express')}
                className={`px-3 py-1.5 rounded transition ${selectedCategory === 'express' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Express
              </button>
              <button
                onClick={() => setSelectedCategory('satuan')}
                className={`px-3 py-1.5 rounded transition ${selectedCategory === 'satuan' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Satuan
              </button>
            </div>
          </div>

          {/* Service Cards Grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {filteredServices.map((pkg) => {
              const isSelected = selectedServiceId === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className={`border rounded p-5 bg-white transition flex flex-col justify-between ${
                    isSelected ? 'border-sky-600 ring-1 ring-sky-600' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {pkg.service_type}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {pkg.estimated_duration_hours} Jam
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 text-base">{pkg.name}</h3>
                    <p className="text-slate-600 text-xs leading-relaxed">{pkg.description}</p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Tarif Layanan</span>
                      <span className="font-extrabold text-lg text-slate-900">
                        Rp {Number(pkg.price_per_unit).toLocaleString('id-ID')}
                      </span>
                      <span className="text-xs text-slate-500"> / {pkg.unit_name}</span>
                    </div>

                    <a
                      href="#order-form"
                      onClick={() => setSelectedServiceId(pkg.id)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded transition ${
                        isSelected
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      {isSelected ? 'Terpilih' : 'Pilih'}
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Order Form */}
        <section id="order-form" className="scroll-mt-20">
          <div className="bg-white border border-slate-200 rounded p-6 sm:p-8 shadow-xs">
            <div className="max-w-2xl mb-6">
              <div className="text-xs font-bold text-sky-600 uppercase tracking-wider">Formulir Pesanan Pelanggan</div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Minta Penjemputan / Antar Cucian</h2>
              <p className="text-slate-500 text-xs mt-1">
                Data akan langsung disimpan ke database <code className="text-sky-600 font-mono">db_client</code> dan siap diproses oleh kasir di dashboard admin.
              </p>
            </div>

            {/* Error Banner */}
            {formError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Success Modal / Banner */}
            {orderSuccess ? (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-900">Pesanan Berhasil Terdaftar!</h3>
                  <p className="text-xs text-emerald-700 mt-1 max-w-md mx-auto">
                    Simpan kode resi ini untuk melacak status penjemputan dan proses pencucian pakaian Anda.
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 bg-white border border-emerald-300 px-4 py-2.5 rounded font-mono text-base font-bold text-slate-900">
                  <span>{orderSuccess.orderCode}</span>
                  <button
                    onClick={() => copyToClipboard(orderSuccess.orderCode)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-500 transition"
                    title="Salin Resi"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {copiedResi && <div className="text-[11px] text-emerald-700">Kode resi berhasil disalin ke clipboard!</div>}

                <div className="pt-2 flex justify-center gap-3">
                  <button
                    onClick={() => {
                      setSearchCode(orderSuccess.orderCode);
                      handleSearchTracking(orderSuccess.orderCode);
                      setOrderSuccess(null);
                    }}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold px-4 py-2 rounded transition"
                  >
                    Lihat Status Resi
                  </button>
                  <button
                    onClick={() => setOrderSuccess(null)}
                    className="bg-white border border-slate-300 text-slate-700 text-xs font-semibold px-4 py-2 rounded hover:bg-slate-50 transition"
                  >
                    Buat Pesanan Baru
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleOrderSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Nama Pelanggan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nama Lengkap <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Rian Pratama"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                    />
                  </div>

                  {/* No. WhatsApp */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Nomor WhatsApp (Aktif) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Contoh: 081234567890"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>

                {/* Alamat Lengkap */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Alamat Penjemputan / Pengantaran <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Nama jalan, nomor rumah/kost, RT/RW, kelurahan, dan patokan..."
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Pilihan Layanan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Pilihan Layanan Laundry <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} - Rp {Number(s.price_per_unit).toLocaleString('id-ID')}/{s.unit_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tipe Penjemputan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Metode Pengambilan
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryType('pickup_delivery')}
                        className={`text-xs py-2 px-3 rounded border font-medium transition text-center ${
                          deliveryType === 'pickup_delivery'
                            ? 'bg-sky-50 border-sky-600 text-sky-800'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Antar-Jemput Kurir
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliveryType('dropoff_pickup')}
                        className={`text-xs py-2 px-3 rounded border font-medium transition text-center ${
                          deliveryType === 'dropoff_pickup'
                            ? 'bg-sky-50 border-sky-600 text-sky-800'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Antar Sendiri ke Outlet
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Estimasi Berat */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Estimasi Berat / Jumlah Pakaian (Opsional)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="Contoh: 3.5"
                        value={estimatedWeight}
                        onChange={(e) => setEstimatedWeight(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">
                        {selectedService?.unit_name || 'KG'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      *Timbangan akurat akan dilakukan oleh kasir saat pakaian tiba di outlet.
                    </span>
                  </div>

                  {/* Catatan Khusus */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">
                      Catatan Khusus untuk Cucian
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Baju kemeja jangan disatukan dengan baju luntur..."
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="w-full sm:w-auto bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm px-6 py-2.5 rounded transition shadow-xs flex items-center justify-center gap-2"
                  >
                    {submittingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Mengirim Pesanan...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Kirim Permintaan Penjemputan
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-16 py-6 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <span className="font-bold text-slate-800">AURA LAUNDRY</span> &copy; 2026. Tugas Integrasi Sistem.
          </div>
          <div className="text-[11px] text-slate-400">
            Arsitektur Terpisah: Client Portal (<code className="text-slate-600">db_client</code>) &bull; Admin POS (<code className="text-slate-600">db_admin</code>)
          </div>
        </div>
      </footer>
    </div>
  );
}
