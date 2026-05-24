# 🚗 AutoVantage Project Documentation

## 1. Project Overview
**AutoVantage** is a full-stack web application designed for browsing, listing, and reserving vehicles. It features a modern, responsive frontend built with Next.js and Tailwind CSS, and a robust backend powered by Java and Spring Boot. The platform includes mock authentication, user-specific listing management, cursor-based pagination for large datasets, and a local simulated wallet/reservation system.

---

## 2. Tech Stack
**Frontend:**
* **Framework:** Next.js 15 (App Router)
* **Styling:** Tailwind CSS
* **State Management:** React Hooks (`useState`, `useEffect`), Custom Hooks (`useListings`, `useAuth`)
* **Forms & Validation:** `react-hook-form` with `@hookform/resolvers/zod` and `zod`
* **Notifications:** `sonner`

**Backend:**
* **Framework:** Spring Boot (Java)
* **Data Access:** Spring Data JPA
* **Database:** Relational DB (implied by JPA/SQL queries)
* **Entity IDs:** UUIDs

---

## 3. Backend Architecture & Logic

### 3.1. Data Model (`CarListing`)
The core entity is the `CarListing` which extends a `BaseEntity` (providing `createdAt`).
* **Fields:** `id` (UUID), `title`, `brand`, `price`, `promotionLevel`, `mlScore`, `username`.
* **Validation:** Enforced via `jakarta.validation.constraints` (e.g., `@NotBlank`, `@Positive` for price).

### 3.2. Pagination Strategy (Important Decision)
The backend implements **Cursor-Based Pagination** instead of standard offset pagination. This is highly performant for large datasets and prevents data skipping or duplication when new items are added simultaneously.
* **Cursor Format:** `"{createdAt}_{id}"` (e.g., `2023-10-25T10:15:30_123e4567-e89b-12d3-a456-426614174000`)
* **Query Logic:** The `CarListingRepository` uses a custom `@Query` to fetch the next page: `WHERE c.createdAt < :createdAt OR (c.createdAt = :createdAt AND c.id < :id) ORDER BY c.createdAt DESC, c.id DESC`. This acts as a reliable tie-breaker.

---

## 4. REST API Documentation (with cURLs)
*Note: Based on the `CarListingService` and typical Spring Boot conventions, the endpoints are structured as follows under the `/api/listings` path.*

### 4.1. Get All Listings (Paginated)
Fetches a list of all car listings globally.
```bash
curl -X GET "http://localhost:8080/api/listings?cursor=2023-10-25T10:15:30_123e4567-e89b...&size=10" \
     -H "Accept: application/json"
```

### 4.2. Get User Specific Listings (Paginated)
Fetches listings posted by a specific user.
```bash
curl -X GET "http://localhost:8080/api/listings/user/Ankit?cursor=&size=10" \
     -H "Accept: application/json"
```

### 4.3. Create a Car Listing
Creates a new car listing on the platform.
```bash
curl -X POST "http://localhost:8080/api/listings" \
     -H "Content-Type: application/json" \
     -d '{
           "title": "2021 Honda Civic EX",
           "brand": "Honda",
           "price": 24500.00,
           "promotionLevel": "GOLD",
           "mlScore": 0.95,
           "username": "Ankit"
         }'
```

### 4.4. Update a Car Listing
Updates an existing car listing by ID.
```bash
curl -X PUT "http://localhost:8080/api/listings/123e4567-e89b-12d3-a456-426614174000" \
     -H "Content-Type: application/json" \
     -d '{
           "title": "2021 Honda Civic EX - Updated",
           "brand": "Honda",
           "price": 23000.00,
           "promotionLevel": "PLATINUM",
           "mlScore": 0.98,
           "username": "Ankit"
         }'
```

---

## 5. Frontend Logic & Important Decisions

### 5.1. Authentication Handling
* **Logic:** The application uses a mock authentication approach for demonstration purposes (`Ankit/Ankit` or `Sugandha/Sugandha`).
* **Implementation:** Stored in a `AuthContext` wrapper and exposed via `useAuth()`. A ProtectedRoute component wraps the dashboard to prevent unauthorized access.

### 5.2. Local State Management (Wallet & Reservations)
* **Decision:** To keep the frontend standalone for specific user-based interactions without heavy backend transactional tables, Wallet Balances and Reservations are tied to the local storage.
* **Wallet Logic:** 
  * Default starting balance is `$500,000`. 
  * Isolated per user via the key `wallet_balance_{username}`.
  * Reserving a car immediately checks if `walletBalance >= listing.price`. If successful, the balance is deducted locally.
* **Reservation Logic:** 
  * Saved locally via `reserved_listings_{username}`.
  * Validation prevents double-booking the same vehicle.
  * Reflected visually in the `ListingCard` by disabling the "Reserve" button and changing it to "Reserved".

### 5.3. Form Handling (`ListingForm.tsx`)
* **Validation (Zod):** 
  * `title`: Minimum 3 characters.
  * `brand`: Minimum 2 characters.
  * `price`: Must be greater than 0.
  * `mlScore`: Bounded between `0` and `1`.
* **Submitting:** Safely differentiates between "Create" and "Update" logic using the presence of an `initialData.id` prop. 
* **Important UX:** Sets `isSubmitting` to disable buttons and show loading spinners to prevent duplicate submissions. Returns the user to the `onSuccess` callback (routing back to "Browse" tab).

### 5.4. Dashboard & Navigation
* **Tab-based Navigation:** Uses React state (`activeTab`) rather than Next.js routing for internal dashboard tabs (Browse, My Listings, Reservations, Sell, Wallet) to allow seamless, instant switching without page reloads.
* **Logout & Data Wipe:** A crucial privacy/testing feature was implemented upon logout. The user is prompted with a modal asking if they wish to wipe their local wallet and reservation data upon exit, leaving the machine clean for the next user.

### 5.5 UI/UX Component Highlights
* **ListingCard:** Includes dynamic UI logic. If a listing has a `promotionLevel`, it displays a visually distinct, gradient-styled badge. The reserve button dynamic styling heavily relies on the `isReserved` boolean prop.
* **Responsive Sidebar:** The dashboard uses an off-canvas overlay approach for mobile responsiveness, transitioning the translation on the X-axis (`-translate-x-full` to `translate-x-0`).

---

## 6. Future Recommendations / Tech Debt
1. **Move Wallet/Reservations to Backend:** Currently handled via `localStorage`. For production, this should be moved to PostgreSQL (e.g., `Reservation` entity and `UserWallet` entity) for security and cross-device consistency.
2. **Implement Real Authentication:** Replace hardcoded credentials in `login/page.tsx` with JWT tokens, NextAuth, or an OAuth2 provider.
3. **API Centralization:** Ensure `fetch` mechanisms in `@/lib/api` are securely handling base URLs using `.env` environment variables.