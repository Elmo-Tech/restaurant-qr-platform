import { defineMessages } from './define';

/**
 * FT-11: the real operational Dashboard (KPIs, breakdowns, timing, charts)
 * and the Order Detail timeline. Kept in its own file rather than growing
 * `common.ts`'s existing (navigation-tile) `dashboard.*` keys further,
 * mirroring `orders.ts`/`presets.ts`/`tables.ts`'s per-feature convention.
 */
export const dashboardMessages = defineMessages({
  en: {
    'analytics.range.today': 'Today',
    'analytics.range.yesterday': 'Yesterday',
    'analytics.range.last7': 'Last 7 days',
    'analytics.range.last30': 'Last 30 days',
    'analytics.range.custom': 'Custom',
    'analytics.viewsLabel': 'Date range',

    'analytics.kpi.revenue': 'Revenue',
    'analytics.kpi.totalOrders': 'Total orders',
    'analytics.kpi.averageOrderValue': 'Average order value',
    'analytics.kpi.activeOrders': 'Active orders',

    'analytics.section.revenueTrend': 'Revenue trend',
    'analytics.section.ordersByType': 'Orders by type',
    'analytics.section.statusDistribution': 'Status distribution',
    'analytics.section.orderVolume': 'Order volume',
    'analytics.section.timing': 'Operational timing',

    'analytics.timing.acceptance': 'Time to acceptance',
    'analytics.timing.preparation': 'Preparation time',
    'analytics.timing.readyWait': 'Ready waiting time',
    'analytics.timing.pickupFulfillment': 'Pickup fulfillment',
    'analytics.timing.deliveryFulfillment': 'Delivery time',
    'analytics.timing.totalFulfillment': 'Total fulfillment',

    'analytics.empty.noOrders': 'No orders in this period yet.',
    'analytics.empty.noData': 'No data yet',
    'analytics.empty.unavailable': '—',
    'analytics.loading': 'Loading dashboard…',
    'analytics.error.retry': 'Retry',

    'analytics.orderType.DINE_IN': 'Dine in',
    'analytics.orderType.PICKUP': 'Pickup',
    'analytics.orderType.DELIVERY': 'Delivery',

    'dashboard.nav.subtitle': "{name}'s live operational overview.",
  },
  ar: {
    'analytics.range.today': 'اليوم',
    'analytics.range.yesterday': 'أمس',
    'analytics.range.last7': 'آخر 7 أيام',
    'analytics.range.last30': 'آخر 30 يومًا',
    'analytics.range.custom': 'مخصص',
    'analytics.viewsLabel': 'الفترة الزمنية',

    'analytics.kpi.revenue': 'الإيرادات',
    'analytics.kpi.totalOrders': 'إجمالي الطلبات',
    'analytics.kpi.averageOrderValue': 'متوسط قيمة الطلب',
    'analytics.kpi.activeOrders': 'الطلبات النشطة',

    'analytics.section.revenueTrend': 'اتجاه الإيرادات',
    'analytics.section.ordersByType': 'الطلبات حسب النوع',
    'analytics.section.statusDistribution': 'توزيع الحالات',
    'analytics.section.orderVolume': 'حجم الطلبات',
    'analytics.section.timing': 'التوقيت التشغيلي',

    'analytics.timing.acceptance': 'وقت القبول',
    'analytics.timing.preparation': 'وقت التحضير',
    'analytics.timing.readyWait': 'وقت انتظار الجاهزية',
    'analytics.timing.pickupFulfillment': 'وقت الاستلام',
    'analytics.timing.deliveryFulfillment': 'وقت التوصيل',
    'analytics.timing.totalFulfillment': 'إجمالي وقت التنفيذ',

    'analytics.empty.noOrders': 'لا توجد طلبات في هذه الفترة بعد.',
    'analytics.empty.noData': 'لا توجد بيانات بعد',
    'analytics.empty.unavailable': '—',
    'analytics.loading': 'جارٍ تحميل لوحة التحكم…',
    'analytics.error.retry': 'إعادة المحاولة',

    'analytics.orderType.DINE_IN': 'داخل المطعم',
    'analytics.orderType.PICKUP': 'استلام',
    'analytics.orderType.DELIVERY': 'توصيل',

    'dashboard.nav.subtitle': 'نظرة تشغيلية مباشرة على {name}.',
  },
});
