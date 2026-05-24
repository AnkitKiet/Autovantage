import { Listing } from "@/lib/api";

interface ListingCardProps {
  listing: Listing;
  onReserve?: () => void;
  onUnreserve?: () => void;
  isReserved?: boolean;
  isRecommended?: boolean;
  isOwnListing?: boolean;
}

export default function ListingCard({ listing, onReserve, onUnreserve, isReserved, isRecommended, isOwnListing }: ListingCardProps) {
  
  const getPromoColors = (level: string) => {
    switch(level.toUpperCase()) {
      case 'BRONZE': return 'from-orange-300 to-amber-600 text-amber-950';
      case 'SILVER': return 'from-slate-300 to-gray-400 text-gray-900';
      case 'GOLD': return 'from-amber-300 to-yellow-500 text-yellow-950';
      case 'PLATINUM': return 'from-slate-700 to-slate-900 text-gray-100';
      case 'PREMIUM': return 'from-emerald-400 to-teal-600 text-white';
      default: return 'from-slate-100 to-slate-200 text-slate-700';
    }
  };

  return (
    <div className="group bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 border border-slate-100 overflow-hidden flex flex-col h-full transform hover:-translate-y-1">
      <div className="p-6 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-xl font-bold text-slate-800 line-clamp-2 leading-tight pr-2 group-hover:text-blue-700 transition-colors" title={listing.title}>
            {listing.title}
          </h3>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {listing.promotionLevel && listing.promotionLevel.toUpperCase() !== "STANDARD" && listing.promotionLevel.toUpperCase() !== "NONE" && (
              <span className={`px-3 py-1 text-[10px] font-extrabold bg-gradient-to-r ${getPromoColors(listing.promotionLevel)} rounded-full uppercase tracking-widest shadow-sm`}>
                {listing.promotionLevel}
              </span>
            )}
            {isRecommended && (
              <div className="group/badge relative inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded cursor-help">
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-widest">Recommended</span>
                <div className="absolute bottom-full right-0 mb-2 w-max px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-10 shadow-sm">
                  Approved by AutoVantage
                  <div className="absolute top-full right-4 border-4 border-transparent border-t-slate-800"></div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <p className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">{listing.brand}</p>
        
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 mb-6 text-sm text-slate-600">
          {/* @ts-ignore - Fallback check in case the interface isn't fully updated yet */}
          {listing.year && <div><span className="font-medium text-slate-400">Year:</span> {(listing as any).year}</div>}
          {(listing as any).kmDriven !== undefined && <div><span className="font-medium text-slate-400">Km:</span> {(listing as any).kmDriven.toLocaleString()}</div>}
          {(listing as any).fuelType && <div><span className="font-medium text-slate-400">Fuel:</span> {(listing as any).fuelType}</div>}
          {(listing as any).transmission && <div><span className="font-medium text-slate-400">Trans:</span> {(listing as any).transmission}</div>}
          {(listing as any).city && <div><span className="font-medium text-slate-400">City:</span> {(listing as any).city}</div>}
          {(listing as any).healthScore !== undefined && <div><span className="font-medium text-slate-400">Health:</span> {Math.round((listing as any).healthScore * 100)}%</div>}
        </div>

        <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
          <span className="text-2xl font-extrabold text-slate-900">
            ${listing.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
          <button 
            onClick={isReserved && onUnreserve ? onUnreserve : onReserve}
            disabled={(isReserved && !onUnreserve) || isOwnListing}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isOwnListing
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : isReserved && !onUnreserve
                ? "bg-slate-100 text-slate-400 cursor-not-allowed" 
              : isReserved && onUnreserve
                ? "text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100"
                : "text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100"
            }`}
          >
            {isOwnListing ? "Your Listing" : isReserved && !onUnreserve ? "Reserved" : isReserved && onUnreserve ? "Unreserve" : "Reserve"}
          </button>
        </div>
      </div>
    </div>
  );
}