import { buildPurgePlan, type ForeignKeyEdge } from './demo-purge';

const edge = (
  childTable: string,
  parentTable: string,
  rule = 'r',
  childColumn = `${parentTable}_id`,
): ForeignKeyEdge => ({
  childTable,
  parentTable,
  deleteRule: rule,
  childColumns: [childColumn],
  parentColumns: ['id'],
});

const columns = (spec: Record<string, string[]>) =>
  new Map(Object.entries(spec).map(([table, cols]) => [table, new Set(cols)]));

describe('demo purge plan', () => {
  const edges: ForeignKeyEdge[] = [
    edge('menus', 'restaurants', 'r', 'restaurant_id'),
    edge('categories', 'restaurants', 'r', 'restaurant_id'),
    edge('categories', 'menus', 'r', 'menu_id'),
    edge('products', 'restaurants', 'r', 'restaurant_id'),
    edge('products', 'categories', 'r', 'category_id'),
    edge('product_translations', 'products', 'c', 'product_id'),
    edge('order_items', 'products', 'r', 'product_id'),
    edge('orders', 'restaurants', 'r', 'restaurant_id'),
    edge('order_items', 'orders', 'r', 'order_id'),
    // the platform audit log keeps its rows: the foreign key only detaches them
    edge('platform_audit_log', 'restaurants', 'n', 'restaurant_id'),
    // ANOTHER restaurant may point at this one (a referrer): that must never delete its row
    edge(
      'restaurant_acquisitions',
      'restaurants',
      'n',
      'referring_restaurant_id',
    ),
  ];
  const cols = columns({
    restaurants: ['id'],
    menus: ['id', 'restaurant_id'],
    categories: ['id', 'restaurant_id', 'menu_id'],
    products: ['id', 'restaurant_id', 'category_id'],
    product_translations: ['id', 'product_id'],
    orders: ['id', 'restaurant_id'],
    order_items: ['id', 'order_id', 'product_id'],
    platform_audit_log: ['id', 'restaurant_id'],
    restaurant_acquisitions: ['id', 'restaurant_id', 'referring_restaurant_id'],
  });
  const plan = buildPurgePlan({
    edges,
    columnsByTable: cols,
    root: 'restaurants',
    rootWhere: '"id" = $1::uuid',
    useRestaurantId: true,
  });
  const order = plan.map((step) => step.table);
  const whereOf = (table: string) => plan.find((s) => s.table === table)?.where;

  it('deletes every child before its parent and the restaurant last', () => {
    const before = (child: string, parent: string) =>
      expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
    before('order_items', 'orders');
    before('order_items', 'products');
    before('product_translations', 'products');
    before('products', 'categories');
    before('categories', 'menus');
    expect(order[order.length - 1]).toBe('restaurants');
    expect(new Set(order).size).toBe(order.length); // each table once
  });

  it('chooses rows by restaurant_id where the table has it, else through the foreign key', () => {
    expect(whereOf('products')).toBe('"restaurant_id" = $1');
    expect(whereOf('orders')).toBe('"restaurant_id" = $1');
    expect(whereOf('product_translations')).toBe(
      '("product_id" IN (SELECT "id" FROM "products" WHERE "restaurant_id" = $1))',
    );
    expect(whereOf('restaurants')).toBe('"id" = $1::uuid');
  });

  it('leaves a SET NULL link alone: the audit log and a referrer keep their rows', () => {
    expect(order).not.toContain('platform_audit_log');
    expect(order).not.toContain('restaurant_acquisitions');
  });

  it('matches a composite foreign key as a whole row (the tenant-consistency keys of table sessions)', () => {
    const composite = buildPurgePlan({
      edges: [
        ...edges,
        {
          childTable: 'sessions',
          parentTable: 'products',
          deleteRule: 'r',
          childColumns: ['a', 'b'],
          parentColumns: ['id', 'other'],
        },
      ],
      columnsByTable: new Map([
        ...cols,
        ['sessions', new Set(['id', 'a', 'b'])],
      ]),
      root: 'restaurants',
      rootWhere: '"id" = $1::uuid',
      useRestaurantId: true,
    });
    const step = composite.find((s) => s.table === 'sessions');
    expect(step?.where).toBe(
      '(("a", "b") IN (SELECT "id", "other" FROM "products" WHERE "restaurant_id" = $1))',
    );
    const order = composite.map((s) => s.table);
    expect(order.indexOf('sessions')).toBeLessThan(order.indexOf('products'));
  });

  it('plans the users of a demo through their own links only (no restaurant_id rule)', () => {
    const userPlan = buildPurgePlan({
      edges: [
        edge('auth_sessions', 'users', 'c', 'user_id'),
        edge('restaurant_memberships', 'users', 'r', 'user_id'),
      ],
      columnsByTable: columns({
        users: ['id'],
        auth_sessions: ['id', 'user_id'],
        restaurant_memberships: ['id', 'user_id', 'restaurant_id'],
      }),
      root: 'users',
      rootWhere: '"id" = ANY($1::uuid[])',
      useRestaurantId: false,
    });
    expect(userPlan.map((s) => s.table)).toEqual([
      'auth_sessions',
      'restaurant_memberships',
      'users',
    ]);
    expect(userPlan[1].where).toBe(
      '("user_id" IN (SELECT "id" FROM "users" WHERE "id" = ANY($1::uuid[])))',
    );
  });
});
