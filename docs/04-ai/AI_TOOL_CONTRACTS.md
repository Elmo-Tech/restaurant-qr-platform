# AI Tool Contracts

## Document Purpose

This document defines the authoritative V1 tool contracts used by the Restaurant QR Platform AI Assistant.

It defines:

- AI tool architecture
- Backend authority
- Model-callable tools
- Orchestration context
- Tenant isolation
- Branch isolation
- Guest context
- Tool authentication
- Tool input validation
- Tool output validation
- Product search
- Product details
- Menu categories
- Active Promotions
- Allergen and nutrition handling
- Pricing and availability safety
- Tool limits
- Tool errors
- Timeouts
- Retry behavior
- Observability
- Security
- Future mutation-tool requirements

This specification applies to the Guest AI Assistant Beta in V1.

V1 Guest AI tools are read-only.

---

# 1. Core Tool Principle

The model asks for information.

The Backend decides what information it is allowed to receive.

---

# 2. Backend Authority

AI tools are Backend capabilities.

They are not direct:

- Database queries
- Prisma access
- Internal service access
- Arbitrary HTTP requests
- n8n database access

---

# 3. Tool Architecture

Preferred flow:

Guest

→ Next.js Guest UI

→ NestJS Backend

→ n8n AI Orchestration

→ Model

→ Controlled Backend AI Tool

→ Backend Domain / Query Services

→ PostgreSQL

→ Validated Tool Result

→ Model

→ Backend

→ Guest.

---

# 4. Core Database Rule

The model does not access PostgreSQL.

n8n does not directly access Platform business tables.

Backend remains the only authority over Platform business data.

---

# 5. V1 Tool Philosophy

Expose the smallest useful set of tools.

Do not expose every Backend endpoint as an AI tool.

---

# 6. Why Narrow Tools

Narrow tools improve:

- Security
- Accuracy
- Tenant isolation
- Observability
- Testing
- Prompt-injection resistance
- Cost control

---

# 7. Tool Categories

V1 Guest AI requires four primary tool capabilities:

1. Search Menu Products
2. Get Product Details
3. List Menu Categories
4. List Active Promotions

Additional tools should not be added without a real V1 use case.

---

# 8. No Generic Tool

V1 must not expose tools such as:

- execute_sql
- query_database
- fetch_any_record
- call_api
- fetch_url
- run_code
- execute_command
- generic_http_request
- prisma_query
- get_table
- search_everything

---

# 9. Read-Only V1

Every V1 Guest AI tool is read-only.

No tool may mutate:

- Cart
- Order
- Table Session
- Service Request
- Menu
- Product
- Promotion
- User
- Restaurant
- Branch

---

# 10. Model Tool Arguments

Model-callable arguments contain only information required to answer the Guest's request.

They do not contain authoritative Tenant identity.

---

# 11. Model Cannot Choose Restaurant

The model must not provide:

restaurantId

as an authoritative tool argument.

---

# 12. Model Cannot Choose Branch

The model must not provide:

branchId

as an authoritative tool argument.

---

# 13. Model Cannot Choose Guest Session

The model must not select:

guestSessionId

or:

tableSessionId

as authoritative scope.

---

# 14. Orchestration Context

Every AI request has a Backend-established orchestration context.

Conceptually:

- AI request ID
- Restaurant context
- Branch context where applicable
- Guest Session context where applicable
- Table context where applicable
- Active Locale
- Restaurant currency
- Request timestamp

---

# 15. Context Is Not Model Input Authority

The orchestration may make safe context information available to the model.

The model cannot replace or override Backend-established context.

---

# 16. Context Separation

Tool invocation conceptually contains two separate layers:

Backend / orchestration context

and:

Model tool arguments.

---

# 17. Example

Model requests:

search_menu_products

with:

query = "spicy chicken"

limit = 5.

It does not choose:

Restaurant A

Branch B.

Those already come from validated orchestration context.

---

# 18. Service Identity

n8n calls Backend AI tool interfaces using a dedicated service identity.

---

# 19. No Staff Cookie

n8n must never authenticate using Restaurant User browser cookies.

---

# 20. No Guest Token Reuse by Model

Guest authentication token must not be exposed to the model.

---

# 21. Service Credential Scope

n8n service credential receives only privileges required for AI tool invocation.

---

# 22. Tool Context Validation

Backend validates the incoming AI tool request against the established AI request context.

Do not trust Tenant values merely because they came from n8n.

---

# 23. Context Transport

Exact implementation may use:

- Signed context envelope
- Backend-issued scoped context handle
- Equivalent server-authenticated mechanism

The implementation must preserve the invariant:

The model cannot forge Restaurant or Branch scope.

---

# 24. Context Token Rule

If a signed AI context token is used:

It must be:

- Short-lived
- Server-generated
- Tamper-resistant
- Scoped to the original AI request

---

# 25. No Browser Exposure

Internal AI service credentials or context-signing secrets never reach Guest browser.

---

# 26. Tool Transport

AI tool contracts are transport-independent.

They may map to:

- Internal REST endpoints
- Backend service handlers
- Another controlled internal transport

without changing the Product contract.

---

# 27. API Version

If exposed through HTTP:

Use the existing V1 API versioning strategy.

---

# 28. Internal Route Principle

AI tool routes are service-to-service interfaces.

They are not public Guest APIs.

---

# 29. Public AI Entry

Guest sends normal AI message to Backend.

Backend validates Guest context before invoking orchestration.

---

# 30. Guest Message Contract

Conceptual Guest request:

```json
{
  "message": "What do you recommend?",
  "conversationPublicId": "optional-public-id"
}
```

---

# 31. Forbidden Guest Authority Fields

Normal Guest AI request must not trust fields such as:

```json
{
  "restaurantId": "...",
  "branchId": "...",
  "tableSessionId": "...",
  "internalUserId": "..."
}
```

---

# 32. Context Derivation

Backend derives Restaurant / Branch / Table context from the established Guest entry and Guest Session rules.

---

# 33. AI Conversation ID

Conversation identity exposed to Guest should use an opaque public identifier.

---

# 34. Conversation ID Is Not Authorization

Knowing a conversation public ID is not enough to access it.

Guest context must still validate.

---

# 35. Tool Naming

V1 logical tool names:

- `search_menu_products`
- `get_product_details`
- `list_menu_categories`
- `list_active_promotions`

---

# 36. Tool Name Stability

Tool names should remain stable within API V1.

---

# 37. Tool Schema

Each model-callable tool uses strict structured schema.

Unknown properties should be rejected where practical.

---

# 38. Structured Output

Tool results return structured JSON-compatible objects.

Do not return arbitrary HTML.

---

# 39. Tool Result Trust

Backend-produced tool data may be treated as authoritative Platform data for that request context.

The model may summarize it but must not contradict it.

---

# 40. Tool Result Freshness

Tool result should include enough metadata to understand when it was generated.

Recommended:

`generatedAt`.

---

# 41. Current-State Principle

Current Backend tool result wins over:

- Previous model response
- Earlier conversation text
- Guest assumption
- Model prior knowledge

---

# 42. Locale

Backend resolves active Locale.

Tools return localized Guest-facing content according to:

Requested / active Locale

→ Restaurant Default Locale fallback.

---

# 43. Locale Is Context

Model does not need to pass arbitrary locale to every tool.

---

# 44. Currency

Currency comes from authoritative Restaurant configuration.

---

# 45. Money Representation

Tool money values follow Platform money conventions.

Use Decimal-safe string representation.

Example:

```json
{
  "amount": "250.00",
  "currency": "EGP"
}
```

---

# 46. Internal IDs

Normal AI tool result must not expose internal UUIDs to the model unless an implementation-specific internal requirement is unavoidable.

Prefer Guest-safe public IDs.

---

# 47. Public IDs

Product references should use:

productPublicId.

---

# 48. Category IDs

Category references exposed to the model should use safe public identifiers where available.

---

# 49. Promotion IDs

Promotion public identifier may be used when useful.

Internal database identity remains hidden.

---

# 50. Product Search Tool

Logical name:

`search_menu_products`

---

# 51. Search Purpose

Search relevant active Menu Products inside the current Restaurant / Branch context.

---

# 52. Search Input

Conceptual schema:

```json
{
  "query": "string",
  "categoryPublicId": "optional-string",
  "availability": "ORDERABLE_ONLY",
  "limit": 5
}
```

---

# 53. Search Query

`query` is Guest intent.

Examples:

- spicy chicken
- something light
- burger
- vegan options

---

# 54. Search Query Length

Backend should bound query length.

Recommended practical maximum:

300 characters.

---

# 55. Search Limit

V1 recommended:

Default:
5

Minimum:
1

Maximum:
10.

---

# 56. Search Availability

Supported conceptual values:

`ORDERABLE_ONLY`

`INCLUDE_SOLD_OUT`

---

# 57. Default Search Availability

Default:

`ORDERABLE_ONLY`.

---

# 58. Why Default Orderable

Normal recommendations should prioritize Products that the Guest can currently order.

---

# 59. Sold-Out Search

If Guest explicitly asks about a known Sold Out Product:

Orchestration may use:

`INCLUDE_SOLD_OUT`.

---

# 60. Inactive Products

INACTIVE Products must not appear in normal Guest AI search results.

---

# 61. Branch Overrides

Search uses effective Branch Product state.

---

# 62. Search Price

Search returns Backend-calculated effective Product price context.

---

# 63. Search Promotion

Search may return current valid Promotion summary.

---

# 64. Search Output

Conceptual result:

```json
{
  "products": [
    {
      "productPublicId": "prd_public_...",
      "name": "Double Burger",
      "description": "Localized short description",
      "imageUrl": "/...",
      "availability": "AVAILABLE",
      "price": {
        "amount": "270.00",
        "currency": "EGP",
        "type": "FROM"
      },
      "promotion": null,
      "dietaryTags": []
    }
  ],
  "generatedAt": "2026-08-26T11:00:00Z"
}
```

---

# 65. Price Type

Useful conceptual price types:

`EXACT`

`FROM`

---

# 66. FROM Price

Use `FROM` when required Variant selection can increase final base configuration price.

---

# 67. Search Description

Description must come from verified Restaurant content / fallback translation.

---

# 68. Search Dietary Tags

Only return structured Restaurant-known dietary metadata.

Do not generate tags from Product name.

---

# 69. Search Matching

Backend search may use:

- Product name
- Description
- Category
- Verified metadata
- Search index
- Safe semantic retrieval

---

# 70. Search Result Does Not Create New Facts

Retrieval method may rank Products.

It does not make inferred attributes authoritative.

---

# 71. Semantic Search

If semantic search is used:

Returned Product remains the authoritative entity.

Generated embeddings are retrieval aids, not Restaurant truth.

---

# 72. Search Match Confidence

The model should not expose internal similarity score as Restaurant fact.

---

# 73. Search Result Cap

Never return hundreds of Products to the model for one normal request.

---

# 74. Search Empty Result

Example:

```json
{
  "products": [],
  "generatedAt": "..."
}
```

Model responds without inventing alternatives outside verified Menu data.

---

# 75. Product Details Tool

Logical name:

`get_product_details`

---

# 76. Product Detail Purpose

Retrieve current detailed Guest-safe Product configuration.

---

# 77. Product Detail Input

Conceptual schema:

```json
{
  "productPublicId": "string"
}
```

---

# 78. Product Identity

Backend validates:

- Product belongs to current Restaurant
- Product is Guest-visible
- Product is valid for current Branch context

---

# 79. Cross-Tenant Product ID

If model provides a valid Product public ID from another Restaurant:

Backend must not return that Product.

---

# 80. Cross-Tenant Response

Use safe not-found / unavailable behavior.

Do not reveal that Product exists in another Tenant.

---

# 81. Product Detail Output

Conceptually:

```json
{
  "product": {
    "productPublicId": "prd_public_...",
    "name": "Double Burger",
    "description": "...",
    "availability": "AVAILABLE",
    "imageUrl": "/...",
    "basePrice": {
      "amount": "200.00",
      "currency": "EGP"
    },
    "effectiveStartingPrice": {
      "amount": "200.00",
      "currency": "EGP"
    },
    "variants": [],
    "modifierGroups": [],
    "dietary": {},
    "allergens": {},
    "nutrition": {},
    "promotion": null
  },
  "generatedAt": "..."
}
```

---

# 82. Product Variant

Variant output may contain:

- Variant public ID
- Localized name
- Price adjustment
- Status / availability
- Default state

---

# 83. Variant Translation

Variant name follows:

`ProductVariantTranslation`

and Restaurant Locale fallback rules.

---

# 84. Variant Internal State

Only Guest-relevant Variant state is returned.

Do not expose internal database metadata.

---

# 85. Variant Price

Price adjustment uses Decimal-safe money representation.

---

# 86. Modifier Group

Modifier Group output may contain:

- Public identifier where available
- Localized name
- Minimum selections
- Maximum selections
- Required behavior
- Modifier Options

---

# 87. Modifier Option

Modifier Option may contain:

- Public identifier
- Localized name
- Price adjustment
- Availability where modeled

---

# 88. Modifier Validation

Tool describes configuration.

It does not replace Backend Order validation.

---

# 89. Customer Note

Product details may indicate whether Guest notes are allowed.

AI V1 does not submit notes.

---

# 90. Product Availability

Tool returns current effective availability.

---

# 91. Sold Out Details

A SOLD_OUT Product may be returned by direct detail lookup if current Guest context is allowed to view it.

The result clearly states:

`SOLD_OUT`.

---

# 92. Inactive Detail

INACTIVE Product should normally return Guest-safe not-found / unavailable behavior.

---

# 93. Allergen Data

Product detail provides allergen information only when Platform has verified Restaurant data.

---

# 94. Allergen Output

Conceptual form:

```json
{
  "allergens": {
    "dataAvailable": true,
    "items": [
      "MILK",
      "EGG"
    ],
    "crossContaminationInformationAvailable": false
  }
}
```

---

# 95. Missing Allergen Information

Example:

```json
{
  "allergens": {
    "dataAvailable": false,
    "items": []
  }
}
```

This explicitly means:

Do not infer safety.

---

# 96. Partial Allergen Information

If Platform later supports completeness metadata:

Expose it explicitly.

Do not pretend partial data is complete.

---

# 97. Allergen Tool Requirement

Safety-sensitive allergen answers should use Product Detail data rather than relying on broad search result text.

---

# 98. Nutrition Data

Product details may expose verified Restaurant nutrition data.

---

# 99. Missing Nutrition

Conceptual:

```json
{
  "nutrition": {
    "dataAvailable": false
  }
}
```

---

# 100. Nutrition Values

If available, values should preserve Backend units.

Example:

```json
{
  "nutrition": {
    "dataAvailable": true,
    "calories": 620,
    "protein": {
      "value": "32",
      "unit": "g"
    }
  }
}
```

---

# 101. Nutrition Inference

Model must not calculate missing nutrition values from general knowledge.

---

# 102. Dietary Data

Product detail may expose structured verified dietary tags.

---

# 103. Dietary Missing Data

Absence of a tag does not automatically prove the opposite dietary property unless the Platform model explicitly defines that semantics.

---

# 104. Ingredient Data

If Product structured ingredient information exists:

Tool may expose it.

---

# 105. No Ingredient Guess

If ingredients are not stored:

Return unavailable / absent metadata.

Do not infer recipe.

---

# 106. Product Promotion

Product Detail may include currently applicable Promotion information.

Backend determines validity.

---

# 107. Promotion Calculation

Model does not calculate whether Promotion wins against another Promotion.

---

# 108. Effective Price

Where Backend can safely calculate effective promoted price:

Tool may provide it.

---

# 109. Price Snapshot

AI tool price is current-state information.

It is not an Order price snapshot.

---

# 110. Order Pricing

Final Order pricing always runs through normal Backend pricing pipeline.

---

# 111. Menu Categories Tool

Logical name:

`list_menu_categories`

---

# 112. Category Purpose

Allow AI to understand the Guest-visible structure of the active Menu.

---

# 113. Category Input

Conceptually:

```json
{
  "limit": 30
}
```

---

# 114. Category Scope

Only current Restaurant / Branch Guest-visible Menu Categories are returned.

---

# 115. Category Output

Conceptually:

```json
{
  "categories": [
    {
      "categoryPublicId": "cat_public_...",
      "name": "Burgers",
      "description": null,
      "availableProductCount": 8
    }
  ],
  "generatedAt": "..."
}
```

---

# 116. Category Translation

Category content follows current Locale and fallback rules.

---

# 117. Empty Category

Normal Guest AI should not emphasize Categories with no Guest-visible Products.

---

# 118. Category Limit

Bound result size.

A Restaurant Menu should not create an unbounded tool response.

---

# 119. Category Ordering

Return Categories in authoritative Menu display order.

---

# 120. Category Search Follow-Up

After identifying Category:

Model may call:

`search_menu_products`

with the safe Category public ID.

---

# 121. Active Promotions Tool

Logical name:

`list_active_promotions`

---

# 122. Promotion Purpose

Answer questions such as:

"What offers do you have?"

---

# 123. Promotion Input

Conceptual schema:

```json
{
  "productPublicId": "optional-string",
  "categoryPublicId": "optional-string",
  "limit": 20
}
```

---

# 124. Promotion Scope

Return only currently valid Promotions for the resolved:

Restaurant
+
Branch
+
current time context.

---

# 125. Promotion Timezone

Promotion schedule evaluation follows established Restaurant / Branch time rules.

---

# 126. Promotion Output

Conceptually:

```json
{
  "promotions": [
    {
      "promotionPublicId": "promo_public_...",
      "title": "Dinner Offer",
      "description": "10% off selected burgers",
      "type": "PERCENTAGE",
      "value": "10",
      "target": "CATEGORY",
      "minimumOrderAmount": null,
      "startsAt": "...",
      "endsAt": "..."
    }
  ],
  "generatedAt": "..."
}
```

---

# 127. Promotion Value

Percentage and fixed amount representation must be explicit.

---

# 128. Promotion Internal Priority

Model normally does not need internal numeric priority.

Backend uses it when calculating applicable Promotion.

---

# 129. Promotion Conflict

Tool may return informational Promotions.

Final discount application remains Backend pricing responsibility.

---

# 130. Promotion Expired

Expired Promotion is not returned as active.

---

# 131. Future Promotion

Future scheduled Promotion is not described as currently active.

---

# 132. Promotion Branch Scope

Branch-scoped Promotion must not leak into another Branch Assistant context.

---

# 133. Promotion Product Filter

When `productPublicId` is supplied:

Backend validates Product belongs to current context.

---

# 134. Tool Data Minimization

Return only data the model needs for the Guest task.

---

# 135. No Prisma Object

Never serialize full Prisma records directly as AI tool output.

---

# 136. No Database Metadata

Do not return:

- createdBy internal ID
- internal tenant UUID
- deletedAt internals
- database row version
- internal secret configuration

unless a specific safe requirement exists.

---

# 137. DTO Boundary

AI Tool DTO is separate from:

Prisma model.

---

# 138. Guest-Safe DTO

AI tool data should be at least as restrictive as normal Guest-safe public DTO.

---

# 139. Internal Notes

Restaurant internal notes must not be returned to Guest AI unless explicitly classified Guest-visible.

---

# 140. Kitchen Data

Guest AI does not receive:

- Kitchen internal notes
- Staff assignments
- Ticket diagnostics
- Staff identities

---

# 141. Order Data

Initial V1 tools do not expose Order history.

---

# 142. Table Session Data

Initial V1 tools do not expose Table-wide Session history.

---

# 143. Guest Context Data

Model receives only minimal Guest context required for response quality.

---

# 144. Tool Input Validation

Every Backend tool validates:

- Schema
- String length
- Allowed enum values
- Result limits
- Public identifier format

---

# 145. Unknown Input Fields

Reject unknown fields where practical.

---

# 146. Tool Output Validation

Backend generates typed DTO.

n8n may additionally validate expected Tool Result schema.

---

# 147. Model Structured Call

Model tool arguments must be parsed and schema-validated before Backend invocation.

---

# 148. Invalid Tool Call

Invalid model argument does not get automatically coerced into dangerous behavior.

---

# 149. Safe Correction

Orchestration may allow one safe model correction attempt for malformed read-only arguments.

---

# 150. Tool Call Budget

Recommended V1 default:

Maximum approximately 5 Backend tool calls per Guest turn.

---

# 151. Why Tool Budget

Prevents:

- Infinite loops
- Cost escalation
- Excessive Backend load
- Prompt-injection loops

---

# 152. Tool Budget Is Configurable

Exact value may be tuned after Pilot measurement.

---

# 153. Product Detail Fan-Out

Avoid retrieving dozens of Product details individually.

---

# 154. Recommendation Pattern

Typical recommendation flow:

search_menu_products

→ optionally get_product_details for a small number of finalists

→ answer.

---

# 155. Compare Pattern

Typical comparison:

get_product_details Product A

+

get_product_details Product B

→ compare verified fields.

---

# 156. Offers Pattern

Typical offers request:

list_active_promotions

→ optionally search target Products

→ answer.

---

# 157. Menu Overview Pattern

Typical:

list_menu_categories

→ search selected Category if needed.

---

# 158. Allergy Pattern

Typical:

search relevant Product if necessary

→ get_product_details

→ answer only from verified allergen data.

---

# 159. Tool Timeout

Backend tool calls require bounded timeout.

Do not wait indefinitely.

---

# 160. Timeout Behavior

Tool timeout becomes a controlled tool failure.

Model must not invent result.

---

# 161. Retry

Read-only tool calls may be safely retried in limited circumstances.

---

# 162. Retry Limit

Avoid uncontrolled retries.

Recommended orchestration behavior:

At most one automatic retry for clearly transient read failure.

---

# 163. No Retry Storm

Multiple concurrent failures must not create retry amplification.

---

# 164. Tool Error Envelope

Conceptually:

```json
{
  "error": {
    "code": "AI_TOOL_UNAVAILABLE",
    "message": "Tool temporarily unavailable",
    "requestId": "..."
  }
}
```

---

# 165. Internal Error Codes

Potential internal codes:

- `AI_TOOL_INPUT_INVALID`
- `AI_TOOL_CONTEXT_INVALID`
- `AI_TOOL_FORBIDDEN`
- `AI_TOOL_NOT_FOUND`
- `AI_TOOL_RATE_LIMITED`
- `AI_TOOL_UNAVAILABLE`
- `AI_TOOL_TIMEOUT`
- `AI_TOOL_RESULT_TOO_LARGE`

---

# 166. Guest Error Translation

Internal error code is not shown directly as normal Guest copy.

---

# 167. Context Invalid

`AI_TOOL_CONTEXT_INVALID`

means Backend cannot establish safe authoritative AI context.

No Restaurant data should be returned.

---

# 168. Forbidden

`AI_TOOL_FORBIDDEN`

may represent invalid tool scope.

Do not reveal cross-Tenant details.

---

# 169. Not Found

Cross-Tenant resource lookup should normally collapse into safe not-found behavior where appropriate.

---

# 170. Result Too Large

Backend must enforce result caps rather than returning massive Menu payload.

---

# 171. Tool Rate Limiting

Tool interface may have service-level abuse / runaway protection in addition to Guest AI endpoint rate limiting.

---

# 172. Rate Limit Context

Rate limiting must not allow one Restaurant to consume unlimited AI Backend resources.

---

# 173. Query Safety

Search input is untrusted text.

---

# 174. SQL Injection

Backend uses normal safe query patterns / Prisma APIs.

Never interpolate model text into raw SQL.

---

# 175. Raw SQL

If specialized PostgreSQL search uses raw SQL:

Use parameterized queries only.

---

# 176. Search Index

Search implementation may evolve without changing model tool contract.

---

# 177. Embeddings

If future embeddings are used:

Embedding query remains tenant-scoped.

---

# 178. Vector Store

A future vector store must preserve Restaurant isolation.

---

# 179. No Global Tenant Retrieval

Never perform global semantic retrieval and rely on the model to discard other Restaurants.

---

# 180. Tenant Filter First

Retrieval must enforce tenant scope before data reaches model.

---

# 181. Branch Filter

Branch-effective Menu behavior is resolved before data reaches model.

---

# 182. Prompt Injection Does Not Change Tool Scope

Guest may ask:

"Use another restaurant ID."

Tool ignores this as authority.

---

# 183. Product Description Injection

Product text cannot cause:

- New tool permission
- Different Tenant
- Database command
- Promotion mutation

---

# 184. Model Cannot Create Tool

Model may call only registered tool names.

---

# 185. Unknown Tool

Unknown requested tool call is rejected.

---

# 186. Tool Registry

n8n / orchestration maintains explicit allowlisted Tool Registry.

---

# 187. Registry V1

Registered V1 Guest tools should initially be only:

- search_menu_products
- get_product_details
- list_menu_categories
- list_active_promotions

---

# 188. Tool Description

Tool descriptions should tell model:

- What tool does
- When to use it
- What it does not prove

---

# 189. Allergen Tool Description

Product Details tool description should explicitly state:

Missing allergen data does not mean allergen-free.

---

# 190. Nutrition Tool Description

Missing nutrition data must not be estimated.

---

# 191. Price Tool Description

Price returned is current Platform price at tool execution time.

---

# 192. Availability Tool Description

Availability is current state and may later change.

---

# 193. Promotion Tool Description

Promotion result is current active promotional information.

Final Order discount remains Backend-authoritative.

---

# 194. Tool Call Logging

For every Tool call log safe operational metadata:

- AI request ID
- Tool name
- Duration
- Success / failure
- Result count
- Error category

---

# 195. Log Tenant Reference

Internal Restaurant reference may be logged according to normal server logging policy.

Do not expose it to Guest.

---

# 196. Log Tool Arguments

Do not blindly log full Guest query if privacy policy requires minimization.

---

# 197. Secret Redaction

Never log:

- Service credential
- Context signing secret
- Guest authentication token
- Provider API key

---

# 198. Tool Trace

One AI request should be traceable across:

Backend
→ n8n
→ model
→ tools.

---

# 199. Correlation ID

Use existing request / correlation ID convention.

---

# 200. Tool Metrics

Useful metrics:

- Calls per tool
- Success rate
- Error rate
- p50 latency
- p95 latency
- Result count
- Tool calls per AI request

---

# 201. Search Metrics

Track zero-result search rate.

This can reveal Menu data or search quality issues.

---

# 202. Allergen Metrics

Do not log sensitive Guest medical condition as structured profile.

---

# 203. Tool Cost

Backend tool call itself should be inexpensive relative to model call.

---

# 204. Caching

Read-only tool results may use safe short-lived caching.

---

# 205. Cache Key

Any cache must include sufficient:

Restaurant
Branch
Locale
Resource
Version / relevant state

context.

---

# 206. Cross-Tenant Cache Prohibited

Cache entry must never be served across Restaurant boundaries.

---

# 207. Price Cache

Price-related cache must be short enough to preserve pricing correctness.

---

# 208. Availability Cache

Availability cache must not create misleading Sold Out / Available answers.

---

# 209. Promotion Cache

Promotion schedule boundaries must invalidate or bypass stale cache.

---

# 210. Tool Result Persistence

Tool results do not need permanent database storage merely because the AI used them.

---

# 211. Conversation Storage

If conversation is stored:

Do not treat old Tool Result as current truth indefinitely.

---

# 212. Revalidation

New factual Guest question may require new tool execution.

---

# 213. Tool Version Changes

Backward-incompatible contract change requires deliberate API / orchestration migration.

---

# 214. Optional Fields

Models should tolerate optional Tool fields being absent.

---

# 215. Required Fields

Only mark fields required when the Backend can reliably guarantee them.

---

# 216. Description Nullability

Product description may be null.

Model must not invent one.

---

# 217. Image Nullability

Product image may be absent.

---

# 218. Promotion Nullability

Product may have no active Promotion.

---

# 219. Allergen Nullability

Missing allergen dataset is a meaningful state.

---

# 220. Tool Result Language

Guest-facing textual fields are localized.

Machine fields remain stable enums.

---

# 221. Enum Translation

Do not translate machine enum values inside Tool contract.

UI/model can map them to natural Guest language.

---

# 222. Decimal

Do not send floating-point money that may produce rounding error.

---

# 223. Time

Timestamps use ISO 8601 UTC representation.

---

# 224. Promotion Schedule

Backend evaluates active schedule using authoritative timezone rules before tool result.

---

# 225. No Model Time Math for Eligibility

Model does not decide whether Promotion is currently valid from raw dates alone when Backend can do it.

---

# 226. No Model Pricing Engine

Model does not implement:

- Promotion conflict resolution
- Discount calculation
- Variant pricing rules
- Modifier totals
- Minimum Order validation

---

# 227. No n8n Pricing Engine

Do not recreate pricing logic in n8n Code nodes.

---

# 228. Backend Reuse

AI tools should call the same core Query / Domain services used by normal Platform features where appropriate.

---

# 229. Avoid Duplicate Business Logic

Example:

Normal Product Detail and AI Product Detail should use the same authoritative effective price rules.

---

# 230. DTO Difference Allowed

Normal Guest API DTO and AI Tool DTO may differ in shape.

Business truth must remain the same.

---

# 231. AI Response Schema

Final model response should preferably be validated into a controlled response format.

---

# 232. Final Response Concept

Example:

```json
{
  "text": "I found three available options.",
  "products": [
    {
      "productPublicId": "prd_public_..."
    }
  ],
  "suggestions": [
    "Show me something cheaper"
  ]
}
```

---

# 233. Product References

Final AI response references Product by public ID.

Frontend retrieves / renders normal Guest Product experience safely.

---

# 234. Do Not Trust Model Price in UI

If structured Product card requires current price:

Prefer Backend-sourced structured result retained in response pipeline or normal Product API refetch.

Do not parse price out of generated prose as authoritative UI value.

---

# 235. Model Text Is Presentation

Generated text is presentation.

Structured Backend data remains truth.

---

# 236. Structured Blocks

Future AI response may support blocks such as:

- PRODUCT_LIST
- PRODUCT_REFERENCE
- PROMOTION_LIST
- FOLLOW_UP_SUGGESTIONS

---

# 237. Block Validation

Block schema must be validated before returning to Guest frontend.

---

# 238. Unsupported Block

Invalid generated block should be removed / fail safely rather than crash Guest UI.

---

# 239. Markdown

Model text may support a small safe Markdown subset if desired.

Do not permit arbitrary HTML.

---

# 240. XSS

Generated AI text is untrusted output.

Render safely.

---

# 241. Link Safety

AI-generated arbitrary external links are not required in V1.

---

# 242. Product Link

Product navigation is constructed by Platform from validated Product public ID.

---

# 243. No Model URL Authority

Do not trust arbitrary model URL as internal Platform routing target.

---

# 244. Tool Outage

If one tool is unavailable:

Assistant may answer only from other current verified Tool results.

---

# 245. No Stale Guess

Do not fill tool failure with model memory.

---

# 246. Partial Failure

Example:

Product search succeeds.

Promotion lookup fails.

Assistant may recommend Products but should avoid claiming current Promotion state.

---

# 247. Tool Failure Message

Tool error details remain internal.

Guest receives concise safe explanation if materially necessary.

---

# 248. Model Provider Tool Calling

Provider-native function/tool calling may be used.

---

# 249. Provider Independence

Logical contracts remain provider-independent.

---

# 250. Model Swap

Changing OpenAI model or another supported provider should not require rewriting Backend Domain rules.

---

# 251. n8n Tool Node

n8n may represent Backend tools through:

- HTTP Request nodes
- AI Tool wrappers
- Controlled sub-workflows

depending on workflow design.

---

# 252. n8n Credentials

Credentials are stored in n8n credential system / environment.

Never hard-code secrets inside prompt text.

---

# 253. n8n Code Node

Code node may transform schemas.

It must not become a hidden business logic engine.

---

# 254. n8n Error Handling

Tool HTTP errors should follow explicit branches.

Do not silently feed error HTML / stack traces back to the model.

---

# 255. n8n Tool Result Sanitization

Only expected structured Tool result is passed to model.

---

# 256. n8n Request Context

Workflow stores validated context separately from Guest message.

---

# 257. Model Cannot Rewrite Context

Model-generated tool arguments cannot overwrite workflow context fields.

---

# 258. Tool Parameter Merge

If Tool request contains model arguments plus Backend context:

Context values must come from trusted workflow variables.

---

# 259. Future Staff Tools

Future Staff AI tools require:

- Staff Auth
- Restaurant Membership
- Permission
- Branch Scope

before invocation.

---

# 260. Future Mutation Tools

Mutation tools are not enabled in V1 Guest AI.

---

# 261. Mutation Requirement

Before adding any mutation Tool, define:

- Exact action
- Input schema
- Authorization
- Domain invariants
- Confirmation requirements
- Idempotency
- Audit behavior
- Error recovery

---

# 262. Cart Mutation Future

Future:

`add_item_to_cart`

would still not be allowed to calculate authoritative price independently.

---

# 263. Order Mutation Future

Future:

`place_order`

would require normal Order idempotency and explicit Guest confirmation.

---

# 264. Service Request Future

Future:

`request_bill`

would require Guest Session / Table Session authorization and safe duplicate handling.

---

# 265. Tool Approval Gate

Adding a model-callable mutation Tool requires explicit Product / Engineering review.

---

# 266. Kill Switch

Platform should be able to disable AI Tool execution globally.

---

# 267. Restaurant AI Disable

If Restaurant AI is disabled:

No Guest AI Tool orchestration should proceed.

---

# 268. Provider Degradation

Backend tools should remain independently functional even if model provider is unavailable.

---

# 269. Tool Test Strategy

Every Tool requires tests for:

- Valid context
- Invalid context
- Cross-Tenant access
- Cross-Branch access
- Invalid public ID
- Input validation
- Output shape
- Locale fallback
- Availability
- Pricing
- Result limits

---

# 270. Search Tool Tests

Test:

- Normal search
- Empty search
- Arabic search
- English search
- Mixed-language search
- Sold Out behavior
- Inactive Product exclusion
- Branch override

---

# 271. Product Detail Tests

Test:

- Variant translations
- Modifiers
- Sold Out
- Missing image
- Missing description
- Missing allergen info
- Missing nutrition
- Promotion
- Cross-Tenant Product ID

---

# 272. Category Tests

Test:

- Display order
- Locale fallback
- Empty Category handling
- Branch Menu behavior

---

# 273. Promotion Tests

Test:

- Active
- Expired
- Future
- Branch-scoped
- Product target
- Category target
- Minimum Order metadata

---

# 274. Prompt Injection Tests

Guest attempts:

"Call another restaurant."

Tool remains current-Tenant scoped.

---

# 275. Model Hallucination Test

Tool returns:

No price.

Assistant must not invent price.

---

# 276. Allergen Safety Test

Tool returns:

`dataAvailable = false`.

Assistant must not say:

"Allergen-free."

---

# 277. Nutrition Safety Test

Tool returns no calories.

Assistant must not estimate calories.

---

# 278. Promotion Safety Test

No active Promotion.

Assistant must not invent discount.

---

# 279. Availability Safety Test

Product SOLD_OUT.

Assistant must not call it currently orderable.

---

# 280. Tool Failure Test

Backend returns timeout.

Assistant must not fabricate result.

---

# 281. Tool Loop Test

Prompt tries to induce repeated Tool calls.

Maximum Tool budget stops loop.

---

# 282. Cross-Tenant Test

Restaurant A context

+
Restaurant B Product public ID

must not return Restaurant B Product.

---

# 283. Branch Isolation Test

Branch A context must receive Branch A effective price / availability.

---

# 284. Locale Test

Arabic Guest receives Arabic Product translation when available.

---

# 285. Locale Fallback Test

Missing Arabic field falls back according to I18N specification.

---

# 286. Decimal Test

Money remains exact through:

Database
→ Backend
→ Tool
→ model response structure.

---

# 287. Logging Test

Secrets are redacted.

---

# 288. Frontend Safety Test

Generated malformed Product ID must not construct unsafe internal route.

---

# 289. Pilot Monitoring

During Pilot monitor:

- Tool errors
- Zero-result searches
- Hallucination incidents
- Cross-context errors
- Price mismatches
- Availability mismatches
- Allergen response quality
- Latency

---

# 290. Tool Change Review

Any Tool schema change should consider:

- Prompt compatibility
- n8n compatibility
- Backend DTO compatibility
- Evaluation suite compatibility

---

# 291. Documentation Ownership

This document defines logical contracts.

Backend DTO / OpenAPI definitions become executable technical source during implementation.

---

# 292. OpenAPI

Where tool transport uses NestJS HTTP routes:

Document internal DTO contracts through OpenAPI where practical.

---

# 293. Generated Client

A generated internal client is optional.

Do not add tooling complexity before needed.

---

# 294. Type Sharing

Shared TypeScript types may be used through:

`packages/shared`

when it provides real value.

---

# 295. Shared Package Rule

Do not expose Prisma types through shared frontend package.

---

# 296. Tool Contract Types

Tool DTO types may live in Backend and selected shared schemas if required by n8n integration generation.

---

# 297. JSON Schema

Provider Tool definitions may be generated from canonical validated schemas where practical.

---

# 298. Schema Duplication

Avoid maintaining several manually divergent versions of the same Tool schema.

---

# 299. Zod

Zod may be used at appropriate TypeScript boundaries.

Nest DTO validation remains aligned with overall Backend conventions.

---

# 300. Tool Contract Source

During implementation choose one clear canonical schema source and derive provider-facing definitions where possible.

---

# 301. V1 Non-Tools

Do not implement these Guest tools in V1:

- create_order
- cancel_order
- accept_order
- add_to_cart
- remove_from_cart
- update_cart
- request_bill
- call_waiter
- mark_paid
- close_table_session
- create_promotion
- change_price
- change_availability
- create_user
- run_sql
- browse_web

---

# 302. Core Tool Invariants

## INV-TOOL-001

Model cannot choose authoritative Restaurant scope.

## INV-TOOL-002

Model cannot choose authoritative Branch scope.

## INV-TOOL-003

V1 Guest tools are read-only.

## INV-TOOL-004

AI tools never directly access Platform database from the model.

## INV-TOOL-005

n8n does not query core Platform tables directly.

## INV-TOOL-006

Backend validates every Tool invocation.

## INV-TOOL-007

Cross-Tenant public IDs do not expose another Restaurant's data.

## INV-TOOL-008

Current Backend price is authoritative.

## INV-TOOL-009

Current Backend availability is authoritative.

## INV-TOOL-010

Missing allergen data is represented explicitly.

## INV-TOOL-011

Missing nutrition data is represented explicitly.

## INV-TOOL-012

Tool result size is bounded.

## INV-TOOL-013

Model tool loops are bounded.

## INV-TOOL-014

Internal secrets are never returned in Tool result.

## INV-TOOL-015

Generated model text is not authoritative structured business data.

## INV-TOOL-016

Final Order pricing never depends on model arithmetic.

## INV-TOOL-017

Tool failure never authorizes model guessing.

## INV-TOOL-018

Tool DTOs are separate from Prisma models.

## INV-TOOL-019

Tool calls are observable and traceable.

## INV-TOOL-020

Future mutation tools require explicit security and Domain design.

---

# 303. Acceptance Criteria

AI Tool architecture is acceptable when:

- Only the intended V1 Guest tools are registered.
- Guest model has no generic SQL tool.
- Guest model has no generic HTTP tool.
- Guest model has no mutation tool.
- Restaurant context is derived by Backend.
- Branch context is derived / validated by Backend.
- Guest token is not exposed to model.
- n8n uses dedicated service identity.
- Tool input schemas reject invalid values.
- Tool output uses Guest-safe DTOs.
- Product search returns only current Tenant data.
- Product search respects Branch availability.
- Product search excludes inactive Products.
- Product details expose Variant translations correctly.
- Product details expose Modifier information correctly.
- Missing allergen information is explicit.
- Missing nutrition information is explicit.
- Money uses Decimal-safe strings.
- Active Promotions are Backend-evaluated.
- Expired Promotions are not returned as active.
- Product public ID from another Tenant does not leak data.
- Tool result size is limited.
- Tool-call count is bounded.
- Read Tool timeout is bounded.
- Transient Tool retry is limited.
- Tool errors have controlled internal codes.
- Tool errors do not leak stack traces to Guest.
- Prompt injection cannot change Tool Tenant scope.
- Product text cannot grant new Tool permissions.
- Tool calls are logged with request correlation.
- Secrets are redacted from Tool logs.
- AI response Product references use safe public IDs.
- Frontend does not trust model-generated price as authoritative.
- Final Order continues through normal Backend pricing.
- n8n failure does not affect core Platform.
- Backend Tool tests include Tenant and Branch isolation.
- Pilot monitors Tool accuracy, latency, and failure rate.

---

# AI Tool Principle

> Give the model the smallest read-only set of capabilities needed to understand the current Restaurant Menu, while every tool remains scoped, validated, observable, and subordinate to Backend authority.
