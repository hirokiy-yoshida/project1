"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Customer } from "./types/customer";
import { Category } from "./types/category";
import { Menu } from "./types/menu";
import { OrderItem } from "./types/order";
import {
  fetchCustomers,
  fetchCategories,
  fetchMenus,
  fetchFoods,
  createTeichaOrder,
  fetchLayout,
} from "./utils/salesforce";
import { format } from "date-fns";
import Navbar from "./components/Navbar";
import ConfirmationModal from "./components/ConfirmationModal";
import LayoutModal from "./components/LayoutModal";
import Toast from "./components/Toast";

type FoodItemState = {
  [key: string]: boolean;
};

export default function Home() {
  const { data: session } = useSession();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [foods, setFoods] = useState<Menu[]>([]);
  const [selectedDrink, setSelectedDrink] = useState<Menu | null>(null);
  const [selectedFood, setSelectedFood] = useState<Menu | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [foodEatInState, setFoodEatInState] = useState<FoodItemState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [layoutImageUrl, setLayoutImageUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (
      session?.user?.accessToken &&
      session?.user?.instanceUrl &&
      session?.user?.shozokuTenpoId
    ) {
      try {
        setLoading(true);
        setError(null);

        // 来店済み顧客を取得
        const customersResponse = await fetchCustomers();
        setCustomers(customersResponse);

        // 来店済み顧客がいる場合にのみ他のデータの取得を続行
        if (customersResponse.length > 0) {
          const [categoriesResult, foodsResult] = await Promise.all([
            fetchCategories(),
            fetchFoods(),
          ]);

          setCategories(categoriesResult);
          setFoods(foodsResult);

          // おもてなし用お菓子の状態を初期化
          const initialFoodState = foodsResult.reduce((acc, food) => {
            acc[food.id] = true;
            return acc;
          }, {} as FoodItemState);
          setFoodEatInState(initialFoodState);
        } else {
          // 来店済み顧客がいない場合は他のデータをリセット
          setCategories([]);
          setFoods([]);
          setFoodEatInState({});
          setSelectedCategory(null);
          setSelectedDrink(null);
          setSelectedFood(null);
          setOrderItems([]);
        }

        setLastUpdated(new Date());
      } catch (err) {
        setError(
          "データの取得に失敗しました。しばらく待ってから再度お試しください。"
        );
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    async function loadMenus() {
      if (selectedCategory) {
        try {
          const menuData = await fetchMenus(selectedCategory);
          setMenus(menuData);
        } catch (err) {
          console.error("Error loading menus:", err);
          setMenus([]);
        }
      } else {
        setMenus([]);
      }
      setSelectedDrink(null);
    }
    loadMenus();
  }, [selectedCategory]);

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSelectedDrink(null);
    setSelectedFood(null);
  };

  const handleDrinkSelect = (menu: Menu) => {
    setSelectedDrink(menu);
  };

  const handleFoodSelect = (food: Menu) => {
    setSelectedFood(food);
  };

  const handleAddOrderSet = () => {
    if (!selectedDrink && !selectedFood) {
      return;
    }

    const isEatIn = selectedFood ? foodEatInState[selectedFood.id] : true;

    setOrderItems([
      ...orderItems,
      {
        id: Date.now(),
        drinkMenu: selectedDrink,
        foodMenu: selectedFood,
        isEatIn,
        hasUtensils: !isEatIn,
      },
    ]);

    setSelectedDrink(null);
    setSelectedFood(null);
  };

  const handleRemoveOrderItem = (id: number) => {
    setOrderItems(orderItems.filter((item) => item.id !== id));
  };

  const toggleEatInState = (foodId: string) => {
    setFoodEatInState((prev) => ({
      ...prev,
      [foodId]: !prev[foodId],
    }));
  };

  const handleSubmitOrder = () => {
    setIsConfirmationModalOpen(true);
  };

  const handleConfirmOrder = async () => {
    try {
      if (!selectedCustomer) {
        throw new Error("No customer selected");
      }

      await Promise.all(
        orderItems.map((item) =>
          createTeichaOrder(item, selectedCustomer).catch((error) => {
            console.error("Error creating order item:", error);
            throw error;
          })
        )
      );

      setToast({
        message: "オーダーがSalesforceに登録されました",
        type: "success",
      });
      setOrderItems([]);
      setSelectedCustomer(null);
      setSelectedDrink(null);
      setSelectedFood(null);
      setIsConfirmationModalOpen(false);

      await loadData();
    } catch (error) {
      console.error("Error submitting order:", error);
      setToast({
        message:
          error instanceof Error
            ? error.message
            : "注文の処理中にエラーが発生しました。",
        type: "error",
      });
      setIsConfirmationModalOpen(false);
    }
  };

  const handleScroll = (
    direction: "left" | "right",
    ref: React.RefObject<HTMLDivElement>
  ) => {
    if (ref.current) {
      const scrollAmount = 200;
      const newScrollLeft =
        direction === "left"
          ? ref.current.scrollLeft - scrollAmount
          : ref.current.scrollLeft + scrollAmount;

      ref.current.scrollTo({
        left: newScrollLeft,
        behavior: "smooth",
      });
    }
  };

  const formatDateTime = (dateTimeStr: string) => {
    return format(new Date(dateTimeStr), "yyyy-MM-dd HH:mm");
  };

  const handleLayoutClick = async () => {
    try {
      const layoutData = await fetchLayout();
      if (layoutData.imageUrl) {
        setLayoutImageUrl(layoutData.imageUrl);
        setIsLayoutModalOpen(true);
      } else {
        setToast({
          message: "レイアウト画像の取得に失敗しました",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error fetching layout:", error);
      setToast({
        message: "レイアウト画像の取得に失敗しました",
        type: "error",
      });
    }
  };

  return (
    <>
      <Navbar
        onRefresh={loadData}
        isLoading={loading}
        lastUpdated={lastUpdated}
        onLayoutClick={handleLayoutClick}
      />
      <div className="flex h-[calc(100vh-4rem)] landscape:flex-row portrait:flex-col">
        <div className="landscape:w-1/4 portrait:h-1/4 bg-white p-4 overflow-y-auto border-r border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">
            未オーダーのお客様
          </h2>
          {loading ? (
            <div className="flex justify-center items-center h-32">
              <div className="text-gray-600">読み込み中...</div>
            </div>
          ) : error ? (
            <div className="text-red-600 p-4 text-center">{error}</div>
          ) : customers.length === 0 ? (
            <div className="text-gray-600 p-4 text-center">
              未オーダーのお客様はいません
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  className={`w-full p-3 text-left rounded-lg transition-colors ${
                    selectedCustomer?.id === customer.id
                      ? "bg-blue-100 border-2 border-blue-500"
                      : "bg-white border border-gray-200 hover:bg-gray-50"
                  }`}
                  onClick={() => handleCustomerSelect(customer)}
                >
                  <div className="font-medium text-gray-800">
                    {customer.name}様
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatDateTime(customer.visitDateTime)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="landscape:w-3/4 portrait:h-3/4 flex flex-col bg-white">
          <div className="bg-white p-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              {selectedCustomer
                ? `${selectedCustomer.name}様 (${formatDateTime(
                    selectedCustomer.visitDateTime
                  )})`
                : "左のサイドバーからお客様を選択してください"}
            </h2>
          </div>

          {selectedCustomer && (
            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 bg-white rounded-lg shadow p-4 border border-gray-200">
                  <div className="flex flex-col space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">
                      飲み物
                    </h3>

                    <div className="relative">
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
                        <button
                          onClick={() => handleScroll("left", tabsRef)}
                          className="p-1 rounded-full bg-white shadow hover:bg-gray-50 border border-gray-200"
                        >
                          <svg
                            className="w-5 h-5 text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 19l-7-7 7-7"
                            />
                          </svg>
                        </button>
                      </div>
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10">
                        <button
                          onClick={() => handleScroll("right", tabsRef)}
                          className="p-1 rounded-full bg-white shadow hover:bg-gray-50 border border-gray-200"
                        >
                          <svg
                            className="w-5 h-5 text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      </div>
                      <div
                        ref={tabsRef}
                        className="overflow-x-auto scrollbar-hide mx-8"
                        style={{
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                        }}
                      >
                        <div className="flex space-x-4 py-2">
                          {categories.map((category) => (
                            <button
                              key={category.id}
                              onClick={() => setSelectedCategory(category.id)}
                              className={`
                                whitespace-nowrap px-4 py-2 rounded-full font-medium text-sm border
                                ${
                                  selectedCategory === category.id
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                }
                              `}
                            >
                              {category.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {menus.map((menu) => (
                        <button
                          key={menu.id}
                          onClick={() => handleDrinkSelect(menu)}
                          className={`w-full p-3 rounded-lg transition-colors flex justify-between items-center border ${
                            selectedDrink?.id === menu.id
                              ? "bg-blue-50 border-2 border-blue-500"
                              : "bg-white border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <span className="font-medium text-gray-800">
                            {menu.name}
                          </span>
                        </button>
                      ))}
                      {selectedCategory && menus.length === 0 && (
                        <div className="text-center text-gray-600 py-4">
                          このカテゴリーのメニューはありません
                        </div>
                      )}
                      {!selectedCategory && (
                        <div className="text-center text-gray-600 py-4">
                          カテゴリーを選択してください
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-span-1 bg-white rounded-lg shadow p-4 border border-gray-200">
                  <div className="flex flex-col space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">
                      食べ物
                    </h3>

                    <div className="space-y-2">
                      {foods.map((food) => (
                        <div
                          key={food.id}
                          className={`flex items-center justify-between p-3 bg-white border rounded-lg cursor-pointer ${
                            selectedFood?.id === food.id
                              ? "border-2 border-blue-500"
                              : "border-gray-200"
                          }`}
                          onClick={() => handleFoodSelect(food)}
                        >
                          <div className="flex-1">
                            <span className="font-medium text-gray-800">
                              {food.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <label
                              className="inline-flex items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="radio"
                                name={`eat-in-${food.id}`}
                                checked={foodEatInState[food.id] !== false}
                                onChange={() => toggleEatInState(food.id)}
                                className="form-radio h-4 w-4 text-blue-600"
                              />
                              <span className="ml-1 text-sm text-gray-600">
                                店内
                              </span>
                            </label>
                            <label
                              className="inline-flex items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="radio"
                                name={`eat-in-${food.id}`}
                                checked={foodEatInState[food.id] === false}
                                onChange={() => toggleEatInState(food.id)}
                                className="form-radio h-4 w-4 text-blue-600"
                              />
                              <span className="ml-1 text-sm text-gray-600">
                                持ち帰り
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-gray-600">
                    {(selectedDrink || selectedFood) && (
                      <div className="flex items-center space-x-4">
                        <span className="font-medium">選択中:</span>
                        <span>
                          {[
                            selectedDrink?.name,
                            selectedFood &&
                              `${selectedFood.name}${
                                foodEatInState[selectedFood.id]
                                  ? "（店内）"
                                  : "（持ち帰り）"
                              }`,
                          ]
                            .filter(Boolean)
                            .join(" / ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleAddOrderSet}
                    disabled={!selectedDrink && !selectedFood}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    セットを追加
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  注文内容
                </h3>
                <div className="space-y-3">
                  {orderItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <span className="font-medium text-gray-500 w-8">
                          {index + 1}.
                        </span>
                        <span className="text-gray-800">
                          {[
                            item.drinkMenu?.name,
                            item.foodMenu &&
                              `${item.foodMenu.name}${
                                item.isEatIn ? "（店内）" : "（持ち帰り）"
                              }`,
                          ]
                            .filter(Boolean)
                            .join(" / ")}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveOrderItem(item.id)}
                        className="ml-4 text-red-500 hover:text-red-700"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  {orderItems.length === 0 && (
                    <p className="text-center text-gray-600 py-4">
                      商品を選択してください
                    </p>
                  )}
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSubmitOrder}
                    disabled={orderItems.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    注文確定
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setIsConfirmationModalOpen(false)}
        onConfirm={handleConfirmOrder}
        orderItems={orderItems}
      />

      <LayoutModal
        isOpen={isLayoutModalOpen}
        onClose={() => setIsLayoutModalOpen(false)}
        imageUrl={layoutImageUrl}
        customers={customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          xCoordinate: customer.xCoordinate ?? 0,
          yCoordinate: customer.yCoordinate ?? 0,
        }))}
        selectedCustomerId={selectedCustomer?.id}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
