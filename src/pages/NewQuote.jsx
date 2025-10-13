
import React, { useState, useEffect } from "react";
import { Quote, QuoteItem, Customer, Vehicle, ServiceItem, MaintenanceReminder, VehicleMileageHistory } from "@/api/entities"; // Added VehicleMileageHistory
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Save, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { addDays, format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function NewQuote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false); // Added submitting state
  const [allQuotes, setAllQuotes] = useState([]);
  
  const [quoteData, setQuoteData] = useState({
    customer_id: "",
    vehicle_id: "",
    quote_number: "",
    status: "em_analise",
    discount_percent: 0,
    discount_amount: 0,
    service_date: new Date().toISOString().split('T')[0],
    vehicle_mileage: 0,
    notes: ""
  });

  const [items, setItems] = useState([]);
  const [customReminders, setCustomReminders] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [customersData, vehiclesData, serviceItemsData, quotesData] = await Promise.all([
      Customer.list("-created_date"),
      Vehicle.list("-created_date"),
      ServiceItem.filter({ is_active: true }, "-created_date"),
      Quote.list("-created_date")
    ]);
    setCustomers(customersData);
    setVehicles(vehiclesData);
    setServiceItems(serviceItemsData);
    setAllQuotes(quotesData);
    
    // Generate next quote number
    const nextNumber = quotesData.length + 1;
    const quoteNumber = `COT-${String(nextNumber).padStart(6, '0')}`;
    setQuoteData(prev => ({ ...prev, quote_number: quoteNumber }));
    
    setLoading(false);
  };

  const customerVehicles = vehicles.filter(v => v.customer_id === quoteData.customer_id);

  const addItem = () => {
    setItems([...items, {
      service_item_id: "",
      service_item_name: "",
      service_item_type: "",
      quantity: 1,
      unit_price: 0,
      cost_price: 0,
      warranty_days: 0,
      replacement_period_days: 0,
      replacement_mileage: 0
    }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === "service_item_id") {
      const serviceItem = serviceItems.find(s => s.id === value);
      if (serviceItem) {
        newItems[index] = {
          ...newItems[index],
          service_item_name: serviceItem.name,
          service_item_type: serviceItem.type,
          unit_price: serviceItem.sale_price,
          cost_price: serviceItem.cost_price,
          warranty_days: serviceItem.default_warranty_days || 0,
          replacement_period_days: serviceItem.replacement_period_days || 0,
          replacement_mileage: serviceItem.replacement_mileage || 0
        };
      }
    }

    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discountValue = quoteData.discount_percent > 0 
      ? (subtotal * quoteData.discount_percent / 100)
      : quoteData.discount_amount;
    return subtotal - discountValue;
  };

  const addCustomReminder = () => {
    setCustomReminders([...customReminders, {
      service_item_id: "",
      service_name: "",
      reminder_type: "tempo",
      target_date: "", // Changed from target_days to target_date
      target_mileage: 0,
      message: ""
    }]);
  };

  const removeCustomReminder = (index) => {
    setCustomReminders(customReminders.filter((_, i) => i !== index));
  };

  const updateCustomReminder = (index, field, value) => {
    const newReminders = [...customReminders];
    newReminders[index][field] = value;

    // When selecting a service item, auto-fill the message template
    if (field === "service_item_id") {
      const serviceItem = serviceItems.find(s => s.id === value);
      if (serviceItem) {
        newReminders[index].service_name = serviceItem.name;
        newReminders[index].message = serviceItem.template_reminder_message || "";
        
        // Auto-fill target date if replacement_period_days is available
        if (serviceItem.replacement_period_days > 0) {
          const targetDate = addDays(new Date(quoteData.service_date), serviceItem.replacement_period_days);
          newReminders[index].target_date = targetDate.toISOString().split('T')[0];
        } else {
          newReminders[index].target_date = ""; // Clear if no replacement_period_days
        }
        
        // Auto-fill target mileage if replacement_mileage is available
        if (serviceItem.replacement_mileage > 0) {
          newReminders[index].target_mileage = serviceItem.replacement_mileage;
        } else {
          newReminders[index].target_mileage = 0; // Clear if no replacement_mileage
        }
        
        // Auto-fill reminder type
        if (serviceItem.replacement_period_days > 0 && serviceItem.replacement_mileage > 0) {
          newReminders[index].reminder_type = "ambos";
        } else if (serviceItem.replacement_period_days > 0) {
          newReminders[index].reminder_type = "tempo"; // 'tempo' refers to by date
        } else if (serviceItem.replacement_mileage > 0) {
          newReminders[index].reminder_type = "quilometragem";
        }
      }
    }
    
    setCustomReminders(newReminders);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (submitting) return; // Evitar duplo submit
    
    if (items.length === 0) {
      alert("Adicione pelo menos um item à cotação");
      return;
    }
    
    if (!quoteData.customer_id || !quoteData.vehicle_id) {
        alert("Por favor, selecione um cliente e um veículo.");
        return;
    }

    setSubmitting(true);

    try {
      const subtotal = calculateSubtotal();
      const total = calculateTotal();
      const discountValue = quoteData.discount_percent > 0 
        ? (subtotal * quoteData.discount_percent / 100)
        : quoteData.discount_amount;

      const quoteToCreate = {
        ...quoteData,
        subtotal,
        total,
        // Persist the effective discount into the correct column
        discount_amount: discountValue,
        amount_pending: total,
        amount_paid: 0,
        payment_status: "pendente"
      };

      if (quoteData.status === "aprovada") {
        quoteToCreate.approved_date = new Date().toISOString();
      }

      const quote = await Quote.create(quoteToCreate);

      const quoteItemsPromises = items.map(item => {
        const warranty_expiry_date = item.warranty_days > 0 
          ? addDays(new Date(quoteData.service_date), item.warranty_days).toISOString().split('T')[0]
          : null;

        const next_service_date = item.replacement_period_days > 0
          ? addDays(new Date(quoteData.service_date), item.replacement_period_days).toISOString().split('T')[0]
          : null;

        const next_service_mileage = item.replacement_mileage > 0
          ? (quoteData.vehicle_mileage || 0) + item.replacement_mileage
          : null;

        return QuoteItem.create({
          quote_id: quote.id,
          service_item_id: item.service_item_id,
          service_item_name: item.service_item_name,
          service_item_type: item.service_item_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price,
          total: item.unit_price * item.quantity,
          warranty_days: item.warranty_days,
          warranty_expiry_date,
          replacement_period_days: item.replacement_period_days,
          replacement_mileage: item.replacement_mileage,
          next_service_date,
          next_service_mileage
        });
      });

      const createdItems = await Promise.all(quoteItemsPromises);

      // Create automatic reminders from items (only if quote is approved)
      if (quoteData.status === "aprovada") {
        const automaticReminderPromises = createdItems
          .filter(item => item.replacement_period_days > 0 || item.replacement_mileage > 0)
          .map(item => {
            const reminderType = item.replacement_period_days > 0 && item.replacement_mileage > 0
              ? "ambos"
              : item.replacement_period_days > 0
                ? "tempo"
                : "quilometragem";

            const customerName = customers.find(c => c.id === quoteData.customer_id)?.name || "";
            const vehicle = vehicles.find(v => v.id === quoteData.vehicle_id);
            const vehicleInfo = vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.license_plate}` : "";

            // Try to get template message from service item
            const serviceItem = serviceItems.find(s => s.id === item.service_item_id);
            const templateMessage = serviceItem?.template_reminder_message || "";
            
            const whatsappMessage = templateMessage
              ? `Olá ${customerName}! 🔧\n\n${templateMessage}\n\nVeículo: ${vehicleInfo}\n\nAgende agora mesmo! 📅`
              : `Olá ${customerName}! 🔧\n\nLembrando que está próximo o período para realizar ${item.service_item_name} no seu ${vehicleInfo}.\n\nAgende agora mesmo! 📅`;

            return MaintenanceReminder.create({
              customer_id: quoteData.customer_id,
              vehicle_id: quoteData.vehicle_id,
              quote_item_id: item.id,
              service_name: item.service_item_name,
              reminder_type: reminderType,
              target_date: item.next_service_date,
              target_mileage: item.next_service_mileage,
              status: "pendente",
              whatsapp_message: whatsappMessage
            });
          });

        await Promise.all(automaticReminderPromises);
      }

      // Lembretes customizados: persistir sempre, e exibir apenas quando a cotação for aprovada
      if (customReminders.length > 0) {
        const customerName = customers.find(c => c.id === quoteData.customer_id)?.name || "";
        const vehicle = vehicles.find(v => v.id === quoteData.vehicle_id);
        const vehicleInfo = vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.license_plate}` : "";

        const customReminderPromises = customReminders.map(reminder => {
          const targetDate = reminder.target_date || null;
          
          let targetMileage = null;
          if (reminder.reminder_type === "quilometragem" || reminder.reminder_type === "ambos") {
              targetMileage = reminder.target_mileage > 0
                  ? (quoteData.vehicle_mileage || 0) + reminder.target_mileage
                  : null;
          }
          
          const defaultMessage = reminder.message
            ? `Olá ${customerName}! 🔧\n\n${reminder.message}\n\nVeículo: ${vehicleInfo}\n\nAgende agora mesmo! 📅`
            : `Olá ${customerName}! 🔧\n\nLembrete sobre: ${reminder.service_name}\n\nVeículo: ${vehicleInfo}\n\nAgende agora mesmo! 📅`;

          return MaintenanceReminder.create({
            customer_id: quoteData.customer_id,
            vehicle_id: quoteData.vehicle_id,
            quote_id: quote.id,
            service_name: reminder.service_name,
            reminder_type: reminder.reminder_type,
            target_date: targetDate,
            target_mileage: targetMileage,
            status: "pendente",
            whatsapp_message: defaultMessage
          });
        });

        await Promise.all(customReminderPromises);
        console.log(`✅ ${customReminders.length} lembrete(s) customizado(s) criado(s)!`);
      }

      if (quoteData.vehicle_mileage > 0 && quoteData.vehicle_id) {
        await Vehicle.update(quoteData.vehicle_id, {
          current_mileage: quoteData.vehicle_mileage
        });
        
        await VehicleMileageHistory.create({
          vehicle_id: quoteData.vehicle_id,
          mileage: quoteData.vehicle_mileage,
          record_date: quoteData.service_date,
          quote_id: quote.id,
          notes: `KM registrada na cotação ${quote.quote_number}`
        });
      }

      navigate(createPageUrl("Quotes"));
    } catch (error) {
      console.error("Erro ao criar cotação:", error);
      alert("Erro ao criar cotação: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-white min-h-screen"> {/* Changed background to plain white */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Quotes"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Nova Cotação</h1>
            <p className="text-gray-500 mt-1">Criar cotação de serviço</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <CardTitle>Informações da Cotação</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Número da Cotação</Label>
                  <Input value={quoteData.quote_number} disabled className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Data do Serviço</Label>
                  <Input
                    type="date"
                    value={quoteData.service_date}
                    onChange={(e) => setQuoteData({...quoteData, service_date: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status da Cotação *</Label>
                  <Select
                    value={quoteData.status}
                    onValueChange={(value) => setQuoteData({...quoteData, status: value})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_analise">Em Análise</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="recusada">Recusada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select
                    value={quoteData.customer_id}
                    onValueChange={(value) => setQuoteData({...quoteData, customer_id: value, vehicle_id: ""})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Veículo *</Label>
                  <Select
                    value={quoteData.vehicle_id}
                    onValueChange={(value) => {
                      const vehicle = vehicles.find(v => v.id === value);
                      setQuoteData({
                        ...quoteData, 
                        vehicle_id: value,
                        vehicle_mileage: vehicle?.current_mileage || 0
                      });
                    }}
                    required
                    disabled={!quoteData.customer_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerVehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.brand} {vehicle.model} - {vehicle.license_plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quilometragem Atual do Veículo</Label>
                <Input
                  type="number"
                  min="0"
                  value={quoteData.vehicle_mileage}
                  onChange={(e) => setQuoteData({...quoteData, vehicle_mileage: parseInt(e.target.value)})}
                  placeholder="Digite a quilometragem"
                  disabled={!quoteData.vehicle_id}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={quoteData.notes}
                  onChange={(e) => setQuoteData({...quoteData, notes: e.target.value})}
                  rows={3}
                  placeholder="Informações adicionais sobre a cotação..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <div className="flex justify-between items-center">
                <CardTitle>Itens da Cotação</CardTitle>
                <Button type="button" onClick={addItem} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {items.map((item, index) => (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold">Item {index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-2">
                        <Label>Serviço/Peça *</Label>
                        <Select
                          value={item.service_item_id}
                          onValueChange={(value) => updateItem(index, "service_item_id", value)}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um item" />
                          </SelectTrigger>
                          <SelectContent>
                            {serviceItems.map((serviceItem) => (
                              <SelectItem key={serviceItem.id} value={serviceItem.id}>
                                {serviceItem.name} - R$ {serviceItem.sale_price.toFixed(2)} ({serviceItem.type === "servico" ? "Serviço" : "Peça"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Preço Unitário (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Garantia (dias)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.warranty_days}
                          onChange={(e) => updateItem(index, "warranty_days", parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total</Label>
                        <Input
                          value={`R$ ${(item.unit_price * item.quantity).toFixed(2)}`}
                          disabled
                          className="font-bold"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {items.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>Nenhum item adicionado ainda</p>
                  <p className="text-sm mt-2">Clique em "Adicionar Item" para começar</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <div className="flex justify-between items-center">
                <CardTitle>Lembretes Personalizados</CardTitle>
                <Button type="button" onClick={addCustomReminder} size="sm" disabled={!quoteData.customer_id || !quoteData.vehicle_id}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Lembrete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Adicione lembretes personalizados para avisar o cliente sobre serviços futuros identificados durante a vistoria.
                {quoteData.status !== "aprovada" && (
                  <span className="block mt-2 text-orange-600 font-medium">
                    ⚠️ Lembretes personalizados só serão ativados quando a cotação for aprovada.
                  </span>
                )}
              </p>
              
              {customReminders.map((reminder, index) => (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold">Lembrete {index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeCustomReminder(index)}
                        className="hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-2">
                        <Label>Selecionar Serviço/Peça do Catálogo</Label>
                        <Select
                          value={reminder.service_item_id}
                          onValueChange={(value) => updateCustomReminder(index, "service_item_id", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione para auto-preencher" />
                          </SelectTrigger>
                          <SelectContent>
                            {serviceItems.map((serviceItem) => (
                              <SelectItem key={serviceItem.id} value={serviceItem.id}>
                                {serviceItem.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                          Selecione um item do catálogo para auto-preencher
                        </p>
                      </div>
                      
                      <div className="md:col-span-2 space-y-2">
                        <Label>Nome do Serviço/Lembrete *</Label>
                        <Input
                          value={reminder.service_name}
                          onChange={(e) => updateCustomReminder(index, "service_name", e.target.value)}
                          placeholder="Ex: Troca de pastilhas de freio"
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Tipo de Lembrete *</Label>
                        <Select
                          value={reminder.reminder_type}
                          onValueChange={(value) => updateCustomReminder(index, "reminder_type", value)}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tempo">Por Data</SelectItem>
                            <SelectItem value="quilometragem">Por Quilometragem</SelectItem>
                            <SelectItem value="ambos">Por Data e Quilometragem</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {(reminder.reminder_type === "tempo" || reminder.reminder_type === "ambos") && (
                        <div className="space-y-2">
                          <Label>Data do Lembrete *</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {reminder.target_date ? format(new Date(reminder.target_date), "dd/MM/yyyy") : "Selecione a data"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={reminder.target_date ? new Date(reminder.target_date) : undefined}
                                onSelect={(date) => {
                                  if (date) {
                                    updateCustomReminder(index, "target_date", date.toISOString().split('T')[0]);
                                  }
                                }}
                                disabled={(date) => date < new Date()}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}

                      {(reminder.reminder_type === "quilometragem" || reminder.reminder_type === "ambos") && (
                        <div className="space-y-2">
                          <Label>Prazo (Km adicionais)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={reminder.target_mileage}
                            onChange={(e) => updateCustomReminder(index, "target_mileage", parseInt(e.target.value))}
                            placeholder="Km adicionais para o próximo serviço"
                            required={reminder.reminder_type === "quilometragem" || reminder.reminder_type === "ambos"}
                          />
                        </div>
                      )}

                      <div className="md:col-span-2 space-y-2">
                        <Label>Mensagem WhatsApp</Label>
                        <Textarea
                          value={reminder.message}
                          onChange={(e) => updateCustomReminder(index, "message", e.target.value)}
                          rows={4}
                          placeholder="Mensagem personalizada para o lembrete"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {customReminders.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <p>Nenhum lembrete personalizado adicionado</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <CardTitle>Totais</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Desconto (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={quoteData.discount_percent}
                    onChange={(e) => setQuoteData({...quoteData, discount_percent: parseFloat(e.target.value), discount_amount: 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quoteData.discount_amount}
                    onChange={(e) => setQuoteData({...quoteData, discount_amount: parseFloat(e.target.value), discount_percent: 0})}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-lg">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-bold">R$ {calculateSubtotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-green-700">R$ {calculateTotal().toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl("Quotes"))}
              disabled={submitting} // Disabled when submitting
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              disabled={submitting} // Disabled when submitting
            >
              <Save className="w-4 h-4 mr-2" />
              {submitting ? "Salvando..." : "Salvar Cotação"} {/* Change button text */}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
