import { defineMessages } from './define';

/**
 * Table Sessions (design v3, V1 scope correction): the Dashboard board, the
 * session drawer, the open / close flows, the session history view and the
 * table order summary. English and Arabic side by side; a key missing from
 * Arabic is a compile error.
 *
 * Wording rule: Restaurant QR Platform V1 is a QR menu and ordering platform,
 * not a POS or accounting system. Nothing here may say or imply that a table
 * was paid, owes money or has a balance: only "accepted orders" and their
 * total, with pending orders shown separately and not counted.
 */
export const sessionsMessages = defineMessages({
  en: {
    // views
    'sessions.view.tables': 'Tables',
    'sessions.view.past': 'Session history',
    'sessions.refresh': 'Refresh',
    'sessions.boardError': 'Could not load table sessions.',

    // ordering availability (table) and session lifecycle: separate concepts
    'sessions.availability.AVAILABLE': 'Open for ordering',
    'sessions.availability.CLOSED_BY_STAFF': 'Ordering closed',
    'sessions.availability.UNAVAILABLE': 'Table inactive',
    'sessions.availabilityHint.CLOSED_BY_STAFF':
      'Guests cannot order from this table until you open a new session.',
    'sessions.status.OPEN': 'Session open',
    'sessions.status.CLOSED': 'Session closed',
    'sessions.noOpenSession': 'No open session',

    // card
    'sessions.card.orders.one': '{count} order',
    'sessions.card.orders.other': '{count} orders',
    'sessions.card.pending.one': '{count} awaiting acceptance',
    'sessions.card.pending.other': '{count} awaiting acceptance',
    'sessions.card.acceptedTotal': 'Accepted orders total',

    // duration
    'sessions.duration.minutes.one': '{count} min',
    'sessions.duration.minutes.other': '{count} min',
    'sessions.duration.hours.one': '{count} h',
    'sessions.duration.hours.other': '{count} h',
    'sessions.duration.days.one': '{count} d',
    'sessions.duration.days.other': '{count} d',
    'sessions.duration.join': '{first} {second}',

    // actions
    'sessions.action.open': 'Open session',
    'sessions.action.view': 'View session',
    'sessions.action.close': 'Close session',
    'sessions.action.summary': 'Print order summary',
    'sessions.action.history': 'Session history',
    'sessions.action.closeDrawer': 'Close panel',
    'sessions.action.back': 'Back',

    // session history view
    'sessions.past.title': 'Session history',
    'sessions.past.hint':
      'Current and past sessions, newest first. Each session keeps its own orders and total.',
    'sessions.past.empty': 'No sessions yet.',
    'sessions.past.allBranches': 'All branches',
    'sessions.past.status': 'Status',
    'sessions.past.statusAll': 'All sessions',
    'sessions.past.table': 'Table {number}',
    'sessions.past.opened': 'Opened {time}',
    'sessions.past.closedAt': 'Closed {time}',
    'sessions.past.filteredTable': 'Showing table {number} only',
    'sessions.past.clearFilter': 'Show all tables',
    'sessions.past.loading': 'Loading sessions…',

    // drawer
    'sessions.detail.title': 'Table {number}',
    'sessions.detail.sessionId': 'Session',
    'sessions.detail.branch': 'Branch',
    'sessions.detail.opened': 'Opened',
    'sessions.detail.closed': 'Closed',
    'sessions.detail.duration': 'Duration',
    'sessions.detail.openedVia.FIRST_ORDER': 'Opened by the first guest order',
    'sessions.detail.openedVia.STAFF': 'Opened by staff',
    'sessions.detail.closure.NORMAL': 'Closed by staff',
    'sessions.detail.closure.FIRST_ORDER_REJECTED': 'Closed automatically: the first order was rejected',
    'sessions.detail.closure.STAFF_CORRECTION': 'Closed by staff (correction)',
    'sessions.detail.closure.OTHER': 'Closed by staff (other reason)',
    'sessions.detail.rounds': 'Orders by round',
    'sessions.detail.noOrders': 'No orders in this session yet.',
    'sessions.detail.round': 'Round {number}',
    'sessions.detail.notCounted': 'Awaiting acceptance: not counted yet',
    'sessions.detail.excluded.one': '{count} rejected or cancelled order is not counted.',
    'sessions.detail.excluded.other': '{count} rejected or cancelled orders are not counted.',
    'sessions.detail.each': 'each',
    'sessions.detail.loading': 'Loading session…',
    'sessions.detail.loadError': 'Could not load this session.',

    // order summary block
    'sessions.summary.title': 'Table order summary',
    'sessions.summary.accepted': 'Accepted orders',
    'sessions.summary.awaiting': 'Awaiting acceptance (not counted)',
    'sessions.summary.serverNote': 'Totals are calculated by the system from the orders as they were placed.',

    // history
    'sessions.history.title': 'History',
    'sessions.history.SESSION_OPENED': 'Session opened',
    'sessions.history.SESSION_CLOSED': 'Session closed',
    'sessions.history.BILL_PRINTED': 'Order summary printed',
    'sessions.history.actor.GUEST': 'Guest',
    'sessions.history.actor.STAFF': 'Staff',
    'sessions.history.actor.SYSTEM': 'System',

    // open dialog
    'sessions.open.title': 'Open a session for table {number}',
    'sessions.open.description':
      'Guests will be able to order from the table QR code again. Earlier sessions stay separate.',
    'sessions.open.confirm': 'Open session',
    'sessions.open.opening': 'Opening…',

    // close dialog
    'sessions.close.title': 'Close this session?',
    'sessions.close.description':
      'Closing stops further ordering from this table until you open a new session. Existing orders keep moving through the kitchen as usual.',
    'sessions.close.pending.one': 'This session has {count} pending order.',
    'sessions.close.pending.other': 'This session has {count} pending orders.',
    'sessions.close.pendingPrompt': 'Choose what happens to them:',
    'sessions.close.keep': 'Keep them',
    'sessions.close.keepHint': 'They stay pending and can still be accepted or rejected later.',
    'sessions.close.reject': 'Reject them now',
    'sessions.close.rejectHint': 'They are rejected like any other rejected order.',
    'sessions.close.rejectNeedsPermission':
      'Rejecting orders needs the permission to reject orders.',
    'sessions.close.choiceRequired': 'Choose what happens to the pending orders.',
    'sessions.close.confirm': 'Close session',
    'sessions.close.closing': 'Closing…',

    // table order summary (print)
    'sessions.print.title': 'Table Order Summary',
    'sessions.print.paper': 'Paper',
    'sessions.print.paper.receipt': 'Receipt (80 mm)',
    'sessions.print.paper.a4': 'A4',
    'sessions.print.print': 'Print summary',
    'sessions.print.loading': 'Preparing the summary…',
    'sessions.print.error': 'Could not load the summary.',
    'sessions.print.close': 'Close',
    'sessions.print.table': 'Table',
    'sessions.print.session': 'Session',
    'sessions.print.opened': 'Opened',
    'sessions.print.closed': 'Closed',
    'sessions.print.printedAt': 'Printed',
    'sessions.print.order': 'Round {number}',
    'sessions.print.awaitingTitle': 'Awaiting acceptance (not counted)',
    'sessions.print.subtotal': 'Accepted orders total',
    'sessions.print.thanks': 'Thank you',
    'sessions.print.openSessionNote': 'Session still open: this summary may change.',

    // staff-facing notices
    'sessions.notice.opened': 'Session opened.',
    'sessions.notice.closed': 'Session closed. Ordering from this table is locked until a new session is opened.',
  },
  ar: {
    'sessions.view.tables': 'الطاولات',
    'sessions.view.past': 'سجل الجلسات',
    'sessions.refresh': 'تحديث',
    'sessions.boardError': 'تعذر تحميل جلسات الطاولات.',

    'sessions.availability.AVAILABLE': 'الطلب متاح',
    'sessions.availability.CLOSED_BY_STAFF': 'الطلب مغلق',
    'sessions.availability.UNAVAILABLE': 'الطاولة غير نشطة',
    'sessions.availabilityHint.CLOSED_BY_STAFF':
      'لا يستطيع الضيوف الطلب من هذه الطاولة حتى تفتح جلسة جديدة.',
    'sessions.status.OPEN': 'الجلسة مفتوحة',
    'sessions.status.CLOSED': 'الجلسة مغلقة',
    'sessions.noOpenSession': 'لا توجد جلسة مفتوحة',

    'sessions.card.orders.one': 'طلب واحد',
    'sessions.card.orders.two': 'طلبان',
    'sessions.card.orders.few': '{count} طلبات',
    'sessions.card.orders.many': '{count} طلبًا',
    'sessions.card.orders.other': '{count} طلب',
    'sessions.card.pending.one': 'طلب واحد بانتظار القبول',
    'sessions.card.pending.two': 'طلبان بانتظار القبول',
    'sessions.card.pending.few': '{count} طلبات بانتظار القبول',
    'sessions.card.pending.many': '{count} طلبًا بانتظار القبول',
    'sessions.card.pending.other': '{count} طلب بانتظار القبول',
    'sessions.card.acceptedTotal': 'إجمالي الطلبات المقبولة',

    'sessions.duration.minutes.one': 'دقيقة واحدة',
    'sessions.duration.minutes.two': 'دقيقتان',
    'sessions.duration.minutes.few': '{count} دقائق',
    'sessions.duration.minutes.many': '{count} دقيقة',
    'sessions.duration.minutes.other': '{count} دقيقة',
    'sessions.duration.hours.one': 'ساعة واحدة',
    'sessions.duration.hours.two': 'ساعتان',
    'sessions.duration.hours.few': '{count} ساعات',
    'sessions.duration.hours.many': '{count} ساعة',
    'sessions.duration.hours.other': '{count} ساعة',
    'sessions.duration.days.one': 'يوم واحد',
    'sessions.duration.days.two': 'يومان',
    'sessions.duration.days.few': '{count} أيام',
    'sessions.duration.days.many': '{count} يومًا',
    'sessions.duration.days.other': '{count} يوم',
    'sessions.duration.join': '{first} و{second}',

    'sessions.action.open': 'فتح جلسة',
    'sessions.action.view': 'عرض الجلسة',
    'sessions.action.close': 'إغلاق الجلسة',
    'sessions.action.summary': 'طباعة ملخص الطلبات',
    'sessions.action.history': 'سجل الجلسات',
    'sessions.action.closeDrawer': 'إغلاق اللوحة',
    'sessions.action.back': 'رجوع',

    'sessions.past.title': 'سجل الجلسات',
    'sessions.past.hint':
      'الجلسات الحالية والسابقة، الأحدث أولًا. تحتفظ كل جلسة بطلباتها وإجماليها.',
    'sessions.past.empty': 'لا توجد جلسات بعد.',
    'sessions.past.allBranches': 'كل الفروع',
    'sessions.past.status': 'الحالة',
    'sessions.past.statusAll': 'كل الجلسات',
    'sessions.past.table': 'الطاولة {number}',
    'sessions.past.opened': 'فُتحت {time}',
    'sessions.past.closedAt': 'أُغلقت {time}',
    'sessions.past.filteredTable': 'عرض الطاولة {number} فقط',
    'sessions.past.clearFilter': 'عرض كل الطاولات',
    'sessions.past.loading': 'جارٍ تحميل الجلسات…',

    'sessions.detail.title': 'الطاولة {number}',
    'sessions.detail.sessionId': 'الجلسة',
    'sessions.detail.branch': 'الفرع',
    'sessions.detail.opened': 'فُتحت',
    'sessions.detail.closed': 'أُغلقت',
    'sessions.detail.duration': 'المدة',
    'sessions.detail.openedVia.FIRST_ORDER': 'فُتحت بأول طلب من الضيف',
    'sessions.detail.openedVia.STAFF': 'فتحها أحد الموظفين',
    'sessions.detail.closure.NORMAL': 'أغلقها أحد الموظفين',
    'sessions.detail.closure.FIRST_ORDER_REJECTED': 'أُغلقت تلقائيًا: تم رفض الطلب الأول',
    'sessions.detail.closure.STAFF_CORRECTION': 'أغلقها أحد الموظفين (تصحيح)',
    'sessions.detail.closure.OTHER': 'أغلقها أحد الموظفين (سبب آخر)',
    'sessions.detail.rounds': 'الطلبات حسب الجولة',
    'sessions.detail.noOrders': 'لا توجد طلبات في هذه الجلسة بعد.',
    'sessions.detail.round': 'الجولة {number}',
    'sessions.detail.notCounted': 'بانتظار القبول: لم يُحتسب بعد',
    'sessions.detail.excluded.one': 'طلب واحد مرفوض أو ملغى لا يُحتسب.',
    'sessions.detail.excluded.two': 'طلبان مرفوضان أو ملغيان لا يُحتسبان.',
    'sessions.detail.excluded.few': '{count} طلبات مرفوضة أو ملغاة لا تُحتسب.',
    'sessions.detail.excluded.many': '{count} طلبًا مرفوضًا أو ملغى لا يُحتسب.',
    'sessions.detail.excluded.other': '{count} طلب مرفوض أو ملغى لا يُحتسب.',
    'sessions.detail.each': 'للواحد',
    'sessions.detail.loading': 'جارٍ تحميل الجلسة…',
    'sessions.detail.loadError': 'تعذر تحميل هذه الجلسة.',

    'sessions.summary.title': 'ملخص طلبات الترابيزة',
    'sessions.summary.accepted': 'الطلبات المقبولة',
    'sessions.summary.awaiting': 'بانتظار القبول (غير محتسب)',
    'sessions.summary.serverNote': 'يحسب النظام الإجماليات من الطلبات كما تم تقديمها.',

    'sessions.history.title': 'السجل',
    'sessions.history.SESSION_OPENED': 'فُتحت الجلسة',
    'sessions.history.SESSION_CLOSED': 'أُغلقت الجلسة',
    'sessions.history.BILL_PRINTED': 'طُبع ملخص الطلبات',
    'sessions.history.actor.GUEST': 'الضيف',
    'sessions.history.actor.STAFF': 'الموظف',
    'sessions.history.actor.SYSTEM': 'النظام',

    'sessions.open.title': 'فتح جلسة للطاولة {number}',
    'sessions.open.description':
      'سيتمكن الضيوف من الطلب عبر رمز QR الخاص بالطاولة مرة أخرى. تبقى الجلسات السابقة منفصلة.',
    'sessions.open.confirm': 'فتح جلسة',
    'sessions.open.opening': 'جارٍ الفتح…',

    'sessions.close.title': 'إغلاق هذه الجلسة؟',
    'sessions.close.description':
      'يوقف الإغلاق الطلب من هذه الطاولة حتى تفتح جلسة جديدة. وتستمر الطلبات الحالية في مسارها المعتاد داخل المطبخ.',
    'sessions.close.pending.one': 'في هذه الجلسة طلب واحد قيد الانتظار.',
    'sessions.close.pending.two': 'في هذه الجلسة طلبان قيد الانتظار.',
    'sessions.close.pending.few': 'في هذه الجلسة {count} طلبات قيد الانتظار.',
    'sessions.close.pending.many': 'في هذه الجلسة {count} طلبًا قيد الانتظار.',
    'sessions.close.pending.other': 'في هذه الجلسة {count} طلب قيد الانتظار.',
    'sessions.close.pendingPrompt': 'اختر ما يحدث لها:',
    'sessions.close.keep': 'إبقاؤها',
    'sessions.close.keepHint': 'تبقى قيد الانتظار ويمكن قبولها أو رفضها لاحقًا.',
    'sessions.close.reject': 'رفضها الآن',
    'sessions.close.rejectHint': 'تُرفض مثل أي طلب مرفوض آخر.',
    'sessions.close.rejectNeedsPermission': 'رفض الطلبات يحتاج إلى صلاحية رفض الطلبات.',
    'sessions.close.choiceRequired': 'اختر ما يحدث للطلبات قيد الانتظار.',
    'sessions.close.confirm': 'إغلاق الجلسة',
    'sessions.close.closing': 'جارٍ الإغلاق…',

    'sessions.print.title': 'ملخص طلبات الترابيزة',
    'sessions.print.paper': 'الورق',
    'sessions.print.paper.receipt': 'إيصال (80 مم)',
    'sessions.print.paper.a4': 'A4',
    'sessions.print.print': 'طباعة الملخص',
    'sessions.print.loading': 'جارٍ تجهيز الملخص…',
    'sessions.print.error': 'تعذر تحميل الملخص.',
    'sessions.print.close': 'إغلاق',
    'sessions.print.table': 'الطاولة',
    'sessions.print.session': 'الجلسة',
    'sessions.print.opened': 'فُتحت',
    'sessions.print.closed': 'أُغلقت',
    'sessions.print.printedAt': 'تمت الطباعة',
    'sessions.print.order': 'الجولة {number}',
    'sessions.print.awaitingTitle': 'بانتظار القبول (غير محتسب)',
    'sessions.print.subtotal': 'إجمالي الطلبات المقبولة',
    'sessions.print.thanks': 'شكرًا لزيارتكم',
    'sessions.print.openSessionNote': 'الجلسة ما زالت مفتوحة: قد يتغير هذا الملخص.',

    'sessions.notice.opened': 'تم فتح الجلسة.',
    'sessions.notice.closed': 'تم إغلاق الجلسة. الطلب من هذه الطاولة مقفل حتى تُفتح جلسة جديدة.',
  },
});
