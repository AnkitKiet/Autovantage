"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import ProtectedRoute from "@/components/ProtectedRoute";
import ListingCard from "@/components/ListingCard";
import ListingForm from "@/components/ListingForm";
import { useListings } from "@/hooks/useListings";
import { useAuth } from "@/hooks/useAuth";
import { Listing } from "@/lib/api";

type Tab = "browse" | "my-listings" | "reservations" | "sell" | "wallet";

export default function DashboardPage() {
  const { logout, username } = useAuth();
  const [appliedFilters, setAppliedFilters] = useState({ brand: "", minPrice: "0", maxPrice: "" });
  const { listings, loading, error, nextCursor, fetchNextPage, refresh: refreshAllListings } = useListings("all", undefined, appliedFilters);
  const { 
    listings: myListings, 
    loading: myLoading, 
    error: myError, 
    nextCursor: myNextCursor, 
    fetchNextPage: fetchMyNextPage,
    refresh: refreshMyListings
  } = useListings("user", username);
  
  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(500000);
  const [reservedListings, setReservedListings] = useState<Listing[]>([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [brandFilter, setBrandFilter] = useState("");
  const [minPriceFilter, setMinPriceFilter] = useState("0");
  const [maxPriceFilter, setMaxPriceFilter] = useState("150000");

  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (refreshAllListings) refreshAllListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters]);

  useEffect(() => {
    if (!username) return; // Wait for username to load

    const savedBalance = localStorage.getItem(`wallet_balance_${username}`);
    if (savedBalance !== null) {
      setWalletBalance(parseFloat(savedBalance));
    } else {
      localStorage.setItem(`wallet_balance_${username}`, "500000");
      setWalletBalance(500000);
    }
    
    const savedReservations = localStorage.getItem(`reserved_listings_${username}`);
    if (savedReservations !== null) {
      try {
        setReservedListings(JSON.parse(savedReservations));
      } catch (e) {
        console.error("Failed to parse reserved listings");
      }
    } else {
      setReservedListings([]); // Clear reservations state for new user
    }
  }, [username]);

  const handleReserve = (listing: Listing) => {
    if (reservedListings.some(r => r.id === listing.id)) {
      toast.info("Car already reserved!");
      return;
    }

    if (walletBalance >= listing.price) {
      const newBalance = walletBalance - listing.price;
      setWalletBalance(newBalance);
      localStorage.setItem(`wallet_balance_${username}`, newBalance.toString());
      
      const updatedReservations = [...reservedListings, listing];
      setReservedListings(updatedReservations);
      localStorage.setItem(`reserved_listings_${username}`, JSON.stringify(updatedReservations));
      
      toast.success(`Successfully reserved ${listing.brand} ${listing.title}!`);
    } else {
      toast.error("Insufficient wallet balance to reserve this car.");
    }
  };

  const handleUnreserve = (listing: Listing) => {
    const newBalance = walletBalance + listing.price;
    setWalletBalance(newBalance);
    localStorage.setItem(`wallet_balance_${username}`, newBalance.toString());
    
    const updatedReservations = reservedListings.filter(r => r.id !== listing.id);
    setReservedListings(updatedReservations);
    localStorage.setItem(`reserved_listings_${username}`, JSON.stringify(updatedReservations));
    
    toast.success(`Successfully unreserved ${listing.brand} ${listing.title}!`);
  };

  const confirmLogout = (wipeData: boolean) => {
    if (wipeData && username) {
      localStorage.removeItem(`wallet_balance_${username}`);
      localStorage.removeItem(`reserved_listings_${username}`);
    }
    logout();
    setShowLogoutModal(false);
  };

  const averageMlScore = listings.length > 0 
    ? listings.reduce((sum, item) => sum + ((item as any).mlScore || 0), 0) / listings.length 
    : 0;

  const myAverageMlScore = myListings.length > 0 
    ? myListings.reduce((sum, item) => sum + ((item as any).mlScore || 0), 0) / myListings.length 
    : 0;

  const reservedAverageMlScore = reservedListings.length > 0 
    ? reservedListings.reduce((sum, item) => sum + ((item as any).mlScore || 0), 0) / reservedListings.length 
    : 0;

  const filteredListings = listings.filter((listing) => {
    const query = searchQuery.toLowerCase();
    return (
      listing.title.toLowerCase().includes(query) ||
      listing.brand.toLowerCase().includes(query) ||
      ((listing as any).city && (listing as any).city.toLowerCase().includes(query))
    );
  });

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "browse",
      label: "Browse Cars",
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: "my-listings",
      label: "My Listings",
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      id: "reservations",
      label: "My Reservations",
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: "sell",
      label: "Sell Your Car",
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: "wallet",
      label: "My Wallet",
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 z-20 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto flex flex-col ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-center h-16 border-b border-slate-100 px-4 shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-xl font-bold text-blue-700 tracking-tight">AutoVantage</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Smarter Choices. Better Drives.
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-6 px-3">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsSidebarOpen(false); // Auto close sidebar on mobile
                  }}
                  className={`w-full flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                    activeTab === item.id
                      ? "bg-blue-50 text-blue-700 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Flex Wrapper */}
        <div className="flex flex-col flex-1 overflow-hidden">
          
          {/* Top Navbar */}
          <header className="bg-white border-b border-slate-200 shadow-sm h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="text-slate-500 hover:text-slate-700 focus:outline-none lg:hidden mr-4 p-2 rounded-md hover:bg-slate-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-slate-800 lg:hidden tracking-tight">AutoVantage</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-sm font-medium text-slate-600">
                Welcome back, <span className="text-slate-900 font-semibold">{username}</span>
              </span>
              <button
                onClick={() => setShowLogoutModal(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Scrollable Content Area */}
          <main className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
              
              {/* Browse Cars Tab */}
              {activeTab === "browse" && (
                <>
                  {error && (
                    <div className="p-4 mb-8 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-sm">
                      {error}
                    </div>
                  )}

                  {/* Fancy Search Bar */}
                  <div className="mb-4 w-full relative group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-blue-500 group-focus-within:text-blue-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search for your dream car by make, model, or city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-14 pr-12 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md focus:shadow-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium placeholder-slate-400"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")}
                        className="absolute inset-y-0 right-0 pr-5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Filters Section */}
                  <div className="mb-10 w-full flex flex-wrap items-end gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Car Company</label>
                      <select
                        value={brandFilter}
                        onChange={(e) => setBrandFilter(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700 font-medium"
                      >
                        <option value="">All Brands</option>
                        {["BMW", "Ford", "Honda", "Hyundai", "Kia", "Mahindra", "Maruti", "Mercedes", "Tata", "Toyota", "Volkswagen"].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px] flex flex-col justify-center px-1 sm:px-3">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Min Price</label>
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">${Number(minPriceFilter).toLocaleString()}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="150000"
                        step="1000"
                        value={minPriceFilter}
                        onChange={(e) => {
                          if (Number(e.target.value) <= Number(maxPriceFilter)) setMinPriceFilter(e.target.value);
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div className="flex-1 min-w-[160px] flex flex-col justify-center px-1 sm:px-3">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Max Price</label>
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          ${Number(maxPriceFilter).toLocaleString()}{maxPriceFilter === "150000" ? "+" : ""}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="150000"
                        step="1000"
                        value={maxPriceFilter}
                        onChange={(e) => {
                          if (Number(e.target.value) >= Number(minPriceFilter)) setMaxPriceFilter(e.target.value);
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                      <div className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0 flex gap-3">
                      <button
                        onClick={() => {
                          setBrandFilter("");
                          setMinPriceFilter("0");
                          setMaxPriceFilter("150000");
                          setSearchQuery("");
                          setAppliedFilters({ brand: "", minPrice: "0", maxPrice: "" });
                        }}
                        className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-xl shadow-sm transition-all disabled:opacity-50"
                        disabled={loading}
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => {
                          setAppliedFilters({ 
                            brand: brandFilter, 
                            minPrice: minPriceFilter, 
                            maxPrice: maxPriceFilter === "150000" ? "" : maxPriceFilter 
                          });
                        }}
                        className="w-full sm:w-auto px-8 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl shadow-sm transition-all disabled:opacity-70 flex justify-center items-center min-w-[120px]"
                        disabled={loading}
                      >
                        {loading ? (
                          <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : "Apply"}
                      </button>
                    </div>
                  </div>

                  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 transition-opacity duration-200 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    {filteredListings.map((listing) => {
                      const isReserved = reservedListings.some(r => r.id === listing.id);
                      return (
                        <ListingCard 
                          key={listing.id} 
                          listing={listing} 
                          isReserved={isReserved} 
                          isRecommended={((listing as any).mlScore || 0) > averageMlScore}
                          isOwnListing={listing.username === username}
                          onReserve={() => handleReserve(listing)} 
                        />
                      );
                    })}
                  </div>

                  {filteredListings.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <svg className="w-16 h-16 text-slate-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <h3 className="text-xl font-bold text-slate-700">No cars found</h3>
                      <p className="text-slate-500 mt-2">
                        {searchQuery || brandFilter || minPriceFilter || maxPriceFilter 
                          ? "We couldn't find anything matching your criteria." 
                          : "No cars are currently listed."}
                      </p>
                    </div>
                  )}

                  <div className="mt-12 mb-8 flex justify-center">
                    {nextCursor && (
                      <button
                        onClick={fetchNextPage}
                        disabled={loading}
                        className="px-8 py-3 bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-full shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {loading ? "Loading more..." : "Load More Listings"}
                      </button>
                    )}
                    {!nextCursor && !loading && listings.length > 0 && (
                      <p className="text-slate-500 text-sm font-medium">You have reached the end of the list.</p>
                    )}
                  </div>
                </>
              )}

              {/* My Listings Tab */}
              {activeTab === "my-listings" && (
                <>
                  {myError && (
                    <div className="p-4 mb-8 bg-red-50 border border-red-200 text-red-700 rounded-lg shadow-sm">
                      {myError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {myListings.map((listing) => {
                      const isReserved = reservedListings.some(r => r.id === listing.id);
                      return (
                        <ListingCard 
                          key={listing.id} 
                          listing={listing} 
                          isReserved={isReserved} 
                          isRecommended={((listing as any).mlScore || 0) > myAverageMlScore}
                          isOwnListing={true}
                          onReserve={() => handleReserve(listing)} 
                        />
                      );
                    })}
                  </div>
                  
                  <div className="mt-12 mb-8 flex justify-center">
                    {myNextCursor && (
                      <button
                        onClick={fetchMyNextPage}
                        disabled={myLoading}
                        className="px-8 py-3 bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-full shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        {myLoading ? "Loading more..." : "Load More Listings"}
                      </button>
                    )}
                    {!myNextCursor && !myLoading && myListings.length > 0 && (
                      <p className="text-slate-500 text-sm font-medium">You have reached the end of your listings.</p>
                    )}
                  </div>
                  
                  {myListings.length === 0 && !myLoading && (
                    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
                      <svg className="w-20 h-20 text-slate-300 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      <h2 className="text-2xl font-bold text-slate-800">No Listings Yet</h2>
                      <p className="mt-2 text-slate-500 max-w-sm">You haven't listed any cars. Head over to the Sell section to post your first vehicle.</p>
                    </div>
                  )}
                </>
              )}

              {/* My Reservations Tab */}
              {activeTab === "reservations" && (
                reservedListings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
                    <svg className="w-20 h-20 text-slate-300 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h2 className="text-2xl font-bold text-slate-800">No Reservations Yet</h2>
                    <p className="mt-2 text-slate-500 max-w-sm">You haven't booked any cars. Head over to the Browse section to find your next drive.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {reservedListings.map((listing) => (
                      <ListingCard 
                        key={listing.id} 
                        listing={listing} 
                        isReserved={true} 
                        isRecommended={((listing as any).mlScore || 0) > reservedAverageMlScore}
                        onUnreserve={() => handleUnreserve(listing)}
                      />
                    ))}
                  </div>
                )
              )}

              {/* Sell Your Car Tab */}
              {activeTab === "sell" && (
                 <div className="py-6 flex flex-col items-center">
                   <div className="mb-8 text-center">
                     <h2 className="text-3xl font-bold text-slate-800">Sell Your Car</h2>
                     <p className="mt-2 text-slate-500">List your vehicle securely on AutoVantage today.</p>
                   </div>
                   <ListingForm 
                     onSuccess={() => {
                       // Trigger data re-fetch for both sections if the hook exposes a refresh method
                       if (refreshAllListings) refreshAllListings();
                       if (refreshMyListings) refreshMyListings();
                       
                       setActiveTab("browse");
                     }} 
                     walletBalance={walletBalance} 
                     onWalletUpdate={(newBal) => {
                       setWalletBalance(newBal);
                       localStorage.setItem(`wallet_balance_${username}`, newBal.toString());
                     }}
                   />
                 </div>
              )}

              {/* Wallet Tab */}
              {activeTab === "wallet" && (
                <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
                  <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 min-w-[320px]">
                    <svg className="w-20 h-20 text-emerald-500 mx-auto mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <h2 className="text-xl font-bold text-slate-500 uppercase tracking-widest">Available Balance</h2>
                    <p className="mt-4 text-5xl font-extrabold text-slate-800">
                      ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 mt-auto shrink-0">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-center items-center">
                <p className="text-slate-400 text-sm font-medium">
                  © {new Date().getFullYear()} AutoVantage. All rights reserved.
                </p>
              </div>
            </footer>
          </main>
        </div>

        {/* Logout Modal */}
        {showLogoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-slate-100 rounded-full mb-4">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-center text-slate-900 mb-2">Ready to Leave?</h3>
                <p className="text-center text-slate-500 mb-6">
                  Do you want to wipe your local data (wallet & reservations) before logging out?
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => confirmLogout(true)}
                    className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-sm transition-colors flex justify-center items-center"
                  >
                    Yes, wipe data and logout
                  </button>
                  <button
                    onClick={() => confirmLogout(false)}
                    className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm transition-colors flex justify-center items-center"
                  >
                    No, keep data and logout
                  </button>
                  <button
                    onClick={() => setShowLogoutModal(false)}
                    className="w-full px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl border border-slate-200 shadow-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}