"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { createListingAPI, updateListingAPI, ListingPayload } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const listingSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  brand: z.string().min(2, "Brand is required"),
  price: z.coerce.number().min(1, "Price must be greater than 0"),
  promotionLevel: z.string().optional().nullable(),
  year: z.coerce.number().min(1900, "Valid year is required"),
  healthScore: z.coerce.number().min(0, "Min score is 0").max(1, "Max score is 1"),
  city: z.string().min(1, "City is required"),
  kmDriven: z.coerce.number().min(0, "Km driven cannot be negative"),
  fuelType: z.string().min(1, "Fuel type is required"),
  transmission: z.string().min(1, "Transmission is required"),
  ownerNumber: z.string().min(1, "Owner number is required"),
});

type ListingFormValues = z.infer<typeof listingSchema>;

const plans = [
  { id: "STANDARD", name: "Standard", price: 0, benefits: "Basic visibility in search results." },
  { id: "BRONZE", name: "Bronze", price: 49, benefits: "Highlighted listing & better ranking." },
  { id: "GOLD", name: "Gold", price: 99, benefits: "Top page placement & social media boost." },
  { id: "PREMIUM", name: "Premium", price: 199, benefits: "Maximum visibility & dedicated support." },
];

interface ListingFormProps {
  initialData?: ListingFormValues & { id?: string };
  onSuccess?: () => void;
  walletBalance?: number;
  onWalletUpdate?: (newBalance: number) => void;
}

export default function ListingForm({ initialData, onSuccess, walletBalance, onWalletUpdate }: ListingFormProps) {
  const isEdit = !!initialData?.id;
  const { username } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: initialData || {
      title: "",
      brand: "",
      price: 0,
      promotionLevel: "NONE",
      year: 2020,
      healthScore: "" as unknown as number, // Start empty so it is clear it needs evaluation
      city: "Mumbai",
      kmDriven: 50000,
      fuelType: "PETROL",
      transmission: "Manual",
      ownerNumber: "First",
    },
  });

  const [showHealthModal, setShowHealthModal] = useState(false);
  const [healthAnswers, setHealthAnswers] = useState({
    accidents: "no",
    service: "yes",
    engine: "no",
    exterior: "excellent",
    interior: "excellent",
  });
  const [hasEvaluatedHealth, setHasEvaluatedHealth] = useState(!!initialData);

  // Plan Modal States
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);
  const [recommendedPlan, setRecommendedPlan] = useState<string>("STANDARD");
  const [selectedPlan, setSelectedPlan] = useState<string>("STANDARD");
  const [savedFormData, setSavedFormData] = useState<ListingFormValues | null>(null);
  const [isStrategyLoading, setIsStrategyLoading] = useState(false);

  const calculateHealthScore = () => {
    let score = 0.2; // Base score
    if (healthAnswers.accidents === "no") score += 0.2;
    if (healthAnswers.service === "yes") score += 0.2;
    if (healthAnswers.engine === "no") score += 0.2;

    if (healthAnswers.exterior === "excellent") score += 0.1;
    else if (healthAnswers.exterior === "good") score += 0.07;
    else if (healthAnswers.exterior === "fair") score += 0.04;

    if (healthAnswers.interior === "excellent") score += 0.1;
    else if (healthAnswers.interior === "good") score += 0.07;
    else if (healthAnswers.interior === "fair") score += 0.04;

    // Round to 2 decimal places
    score = Math.round(score * 100) / 100;

    setValue("healthScore", score, { shouldValidate: true });
    setHasEvaluatedHealth(true);
    setShowHealthModal(false);
  };

  const onSubmit = async (data: ListingFormValues) => {
    if (!hasEvaluatedHealth) {
      toast.error("Please evaluate the car's health score before listing.");
      return;
    }

    try {
      const payload: ListingPayload = {
        ...data,
        username: username || "Ankit", // Attributing listing to current logged in user
        promotionLevel: data.promotionLevel === "NONE" ? null : data.promotionLevel,
      };

      if (isEdit && initialData.id) {
        await updateListingAPI(initialData.id, payload);
        toast.success("Listing updated successfully!");
        onSuccess?.();
      } else {
        const response: any = await createListingAPI(payload);
        // Try to extract the newly created listing ID from the API response
        const newId = response?.id || response?.data?.id;

        if (newId) {
          setCreatedListingId(newId);
          setSavedFormData(data);
          setIsStrategyLoading(true);
          setShowPlanModal(true); // <--- This triggers the popup!

          const userSelectedPlan = data.promotionLevel && data.promotionLevel !== "NONE" ? data.promotionLevel.toUpperCase() : "STANDARD";
          setSelectedPlan(plans.some(p => p.id === userSelectedPlan) ? userSelectedPlan : "STANDARD");

          try {
            if (!newId) {
              return
            }
            const stratRes = await fetch(`http://localhost:8080/api/listings/${newId}/strategy`, {
              headers: { 'Accept': 'application/json' }
            });
            if (stratRes.ok) {
              const strategy = await stratRes.json();
              let rec = strategy.recommendedPromotion?.toUpperCase() || "STANDARD";
              
              // Map ML output "PLUS" to "GOLD" to match the frontend plans array
              if (rec === "PLUS") rec = "GOLD";
              
              const matchedPlan = plans.some(p => p.id === rec) ? rec : "STANDARD";
              setRecommendedPlan(matchedPlan);
              
              toast.info(`AutoVantage recommends the ${plans.find(p => p.id === matchedPlan)?.name || matchedPlan} plan for your Vehicle Listing!`);
            }
          } catch (err) {
            console.error("Strategy API error", err);
          } finally {
            setIsStrategyLoading(false);
          }
        } else {
          // Fallback if the API doesn't return an ID for some reason
          toast.success("Listing created successfully!");
          reset();
          onSuccess?.();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save listing");
    }
  };

  const handlePlanPurchase = async () => {
    if (walletBalance !== undefined && walletBalance < 0) {
      toast.error("Wallet balance is negative. You cannot perform this action.");
      return;
    }

    const plan = plans.find(p => p.id === selectedPlan);
    const cost = plan?.price || 0;
    
    const newBalance = (walletBalance ?? 0) - cost;
    if (onWalletUpdate) onWalletUpdate(newBalance);
    
    if (newBalance < 0) {
      toast.warning("Wallet balance is negative. Please recharge soon.");
    }

    if (createdListingId && savedFormData) {
      try {
        const payload: ListingPayload = {
          ...savedFormData,
          username: username || "Ankit",
          promotionLevel: selectedPlan === "STANDARD" ? null : selectedPlan,
        };
        await updateListingAPI(createdListingId, payload);
      } catch(e) {
        console.error("Failed to update listing plan", e);
      }
    }

    toast.success(`Listing published successfully with ${plan?.name} plan!`);
    setShowPlanModal(false);
    reset();
    onSuccess?.();
  };

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-2xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Listing Title</label>
          <input
            {...register("title")}
            type="text"
            placeholder="e.g. 2021 Honda Civic EX"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.title && <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Brand</label>
          <input
            {...register("brand")}
            type="text"
            placeholder="e.g. Honda"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.brand && <p className="mt-1 text-sm text-red-500">{errors.brand.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Price ($)</label>
          <input
            {...register("price")}
            type="number"
            step="0.01"
            placeholder="24500.00"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.price && <p className="mt-1 text-sm text-red-500">{errors.price.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Promotion Level</label>
          <select
            {...register("promotionLevel")}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
          >
            <option value="NONE">None / Standard</option>
            <option value="BRONZE">Bronze</option>
            <option value="GOLD">Gold</option>
            <option value="PREMIUM">Premium</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Year</label>
          <input
            {...register("year")}
            type="number"
            placeholder="2020"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.year && <p className="mt-1 text-sm text-red-500">{errors.year.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Kilometers Driven</label>
          <input
            {...register("kmDriven")}
            type="number"
            placeholder="50000"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.kmDriven && <p className="mt-1 text-sm text-red-500">{errors.kmDriven.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">City</label>
          <input
            {...register("city")}
            type="text"
            placeholder="e.g. Mumbai"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          {errors.city && <p className="mt-1 text-sm text-red-500">{errors.city.message}</p>}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-semibold text-slate-700">Health Score (0.0 - 1.0)</label>
            <button
              type="button"
              onClick={() => setShowHealthModal(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
            >
              Evaluate Health Score
            </button>
          </div>
          <input
            {...register("healthScore")}
            type="number"
            step="0.01"
            min="0"
            max="1"
        placeholder="Evaluate to calculate score"
            readOnly
            className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none transition-all bg-slate-100 text-slate-500 cursor-not-allowed"
          />
          {errors.healthScore && <p className="mt-1 text-sm text-red-500">{errors.healthScore.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Fuel Type</label>
          <select {...register("fuelType")} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
            <option value="PETROL">Petrol</option>
            <option value="DIESEL">Diesel</option>
            <option value="CNG">CNG</option>
            <option value="ELECTRIC">Electric</option>
            <option value="HYBRID">Hybrid</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Transmission</label>
          <select {...register("transmission")} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
            <option value="Manual">Manual</option>
            <option value="Automatic">Automatic</option>
            <option value="Electric">Electric</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Owner Number</label>
          <select {...register("ownerNumber")} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white">
            <option value="First">First</option>
            <option value="Second">Second</option>
            <option value="Third">Third</option>
            <option value="Fourth+">Fourth or more</option>
          </select>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-70 flex items-center"
        >
          {isSubmitting && (
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          )}
          {isEdit ? "Update Listing" : "List Car"}
        </button>
      </div>
    </form>

    {showHealthModal && (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Evaluate Car Health</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">1. Any major accidents?</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={healthAnswers.accidents} onChange={(e) => setHealthAnswers({ ...healthAnswers, accidents: e.target.value })}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">2. Regular service history?</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={healthAnswers.service} onChange={(e) => setHealthAnswers({ ...healthAnswers, service: e.target.value })}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">3. Any engine/transmission issues?</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={healthAnswers.engine} onChange={(e) => setHealthAnswers({ ...healthAnswers, engine: e.target.value })}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">4. Exterior condition</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={healthAnswers.exterior} onChange={(e) => setHealthAnswers({ ...healthAnswers, exterior: e.target.value })}>
                <option value="excellent">Excellent (No scratches/dents)</option>
                <option value="good">Good (Minor scratches)</option>
                <option value="fair">Fair (Visible dents/fading)</option>
                <option value="poor">Poor (Damage/Rust)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">5. Interior condition</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={healthAnswers.interior} onChange={(e) => setHealthAnswers({ ...healthAnswers, interior: e.target.value })}>
                <option value="excellent">Excellent (Like new)</option>
                <option value="good">Good (Normal wear)</option>
                <option value="fair">Fair (Tears/stains)</option>
                <option value="poor">Poor (Heavy damage)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowHealthModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="button" onClick={calculateHealthScore} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-colors">
              Calculate & Apply
            </button>
          </div>
        </div>
      </div>
    )}

    {showPlanModal && (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 overflow-hidden flex flex-col max-h-[90vh]">
          <h3 className="text-2xl font-bold text-slate-800 mb-2 text-center">Choose a Promotion Plan</h3>
          <p className="text-slate-500 text-center mb-6">Boost your listing's visibility and sell faster.</p>

          {isStrategyLoading ? (
             <div className="flex flex-col justify-center items-center py-12 space-y-4">
               <svg className="animate-spin h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
               <span className="text-slate-600 font-medium">Analyzing listing for best strategy...</span>
             </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto mb-6 p-2">
                {plans.map((plan) => (
                  <div 
                    key={plan.id} 
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative border-2 rounded-xl p-5 cursor-pointer transition-all ${selectedPlan === plan.id ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300'}`}
                  >
                    {recommendedPlan === plan.id && (
                      <div className="absolute top-0 right-0 transform translate-x-1 -translate-y-3">
                        <span className="bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider py-1 px-3 rounded-full shadow-sm">
                          Recommended
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <input type="radio" checked={selectedPlan === plan.id} readOnly className="w-4 h-4 text-blue-600 accent-blue-600" />
                        <h4 className="font-bold text-lg text-slate-800">{plan.name}</h4>
                      </div>
                      <span className="font-extrabold text-xl text-slate-900">${plan.price}</span>
                    </div>
                    <p className="text-sm text-slate-600 ml-7">{plan.benefits}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-auto pt-4 border-t border-slate-100">
                <button type="button" onClick={() => { setShowPlanModal(false); toast.success("Listing created without promotion."); onSuccess?.(); reset(); }} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                  Skip for now
                </button>
                <button type="button" onClick={handlePlanPurchase} className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-sm transition-colors flex items-center gap-2">
                  Pay ${plans.find(p => p.id === selectedPlan)?.price || 0} & Publish
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
    </>
  );
}