export interface Listing {
  id: string;
  title: string;
  brand: string;
  price: number;
  promotionLevel: string | null;
  mlScore: number | null;
  username?: string;
  createdAt: string;
  updatedAt: string;
  year?: number;
  healthScore?: number;
  city?: string;
  kmDriven?: number;
  fuelType?: string;
  transmission?: string;
  ownerNumber?: string;
  recommendedPromotion?: string;
  promotionConfidence?: number;
}

export type ListingPayload = Omit<Listing, 'id' | 'createdAt' | 'updatedAt'>;

export interface CursorPagedResponse<T> {
  data?: T[];      // Handled robustly depending on Java field name
  content?: T[];
  items?: T[];
  nextCursor: string | null;
}

const API_BASE_URL = "/api";

export async function fetchListingsAPI(
  cursor?: string | null,
  size: number = 8,
  filters?: { brand?: string; minPrice?: string; maxPrice?: string } | any
): Promise<CursorPagedResponse<Listing>> {
  const params = new URLSearchParams();
  if (cursor) params.append("cursor", cursor);
  params.append("size", size.toString());

  if (filters?.brand) params.append("brand", filters.brand);
  if (filters?.minPrice) params.append("minPrice", filters.minPrice);
  if (filters?.maxPrice) params.append("maxPrice", filters.maxPrice);

  const url = `${API_BASE_URL}/listings?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch listings: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchUserListingsAPI(
  username: string,
  cursor?: string | null,
  size: number = 8
): Promise<CursorPagedResponse<Listing>> {
  const params = new URLSearchParams();
  params.append("username", username);
  if (cursor) params.append("cursor", cursor);
  params.append("size", size.toString());

  const url = `${API_BASE_URL}/listings/user?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user listings: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function createListingAPI(payload: ListingPayload): Promise<Listing> {
  const response = await fetch(`${API_BASE_URL}/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to create listing");
  return response.json();
}

export async function updateListingAPI(id: string, payload: ListingPayload): Promise<Listing> {
  const response = await fetch(`${API_BASE_URL}/listings/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Failed to update listing");
  return response.json();
}