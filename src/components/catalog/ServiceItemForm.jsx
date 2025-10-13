import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save } from "lucide-react";
import { Supplier } from "@/api/entities";

const MESSAGE_TEMPLATES = {
  "troca_oleo": "Olá! 🚗 Está chegando o momento de trocar o óleo do seu veículo. Agende agora e mantenha seu motor protegido!",
  "revisao": "Olá! 🔧 Seu veículo está chegando no prazo da revisão periódica. Agende e mantenha tudo em dia!",
  "troca_freio": "Olá! ⚠️ É importante verificar o sistema de freios do seu veículo. Sua segurança é prioridade!",
  "alinhamento": "Olá! 🛞 Que tal fazer um alinhamento e balanceamento? Isso aumenta a vida útil dos pneus!",
  "troca_filtro": "Olá! 🌬️ Está na hora de trocar os filtros do seu veículo. Ar limpo, motor saudável!",
  "ar_condicionado": "Olá! ❄️ Que tal fazer uma manutenção no ar condicionado? Verão chegando!",
  "troca_correia": "Olá! ⚙️ A correia dentada precisa de atenção. Evite problemas maiores!",
  "troca_bateria": "Olá! 🔋 A bateria do seu veículo pode estar precisando de atenção. Vamos verificar?"
};

export default function ServiceItemForm({ item, onSubmit, onCancel }) {
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState(item || {
    name: "",
    type: "servico",
    sale_price: 0,
    cost_price: 0,
    supplier_id: "",
    current_stock: 0,
    minimum_stock: 0,
    labor_cost: 0,
    template_reminder_message: "",
    description: "",
    is_active: true
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    const data = await Supplier.list("-created_date");
    setSuppliers(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const applyTemplate = (templateKey) => {
    setFormData({
      ...formData,
      template_reminder_message: MESSAGE_TEMPLATES[templateKey]
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="shadow-xl border-0">
        <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-900">
              {item ? "Editar Item" : "Novo Item"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Troca de óleo, Filtro de ar..."
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({...formData, type: value})}
                  required
                >
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="peca">Peça</SelectItem>
                    <SelectItem value="produto">Produto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="sale_price">Preço de Venda (R$) *</Label>
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sale_price}
                  onChange={(e) => setFormData({...formData, sale_price: parseFloat(e.target.value)})}
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost_price">Preço de Custo (R$) *</Label>
                <Input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({...formData, cost_price: parseFloat(e.target.value)})}
                  required
                  className="border-gray-300"
                />
              </div>
            </div>

            {(formData.type === "peca" || formData.type === "produto") && (
              <>
                <div className="grid md:grid-cols-3 gap-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="space-y-2">
                    <Label htmlFor="supplier_id">Fornecedor</Label>
                    <Select
                      value={formData.supplier_id}
                      onValueChange={(value) => setFormData({...formData, supplier_id: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="current_stock">Estoque Atual</Label>
                    <Input
                      id="current_stock"
                      type="number"
                      min="0"
                      value={formData.current_stock}
                      onChange={(e) => setFormData({...formData, current_stock: parseInt(e.target.value)})}
                      className="border-gray-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum_stock">Estoque Mínimo ⚠️</Label>
                    <Input
                      id="minimum_stock"
                      type="number"
                      min="0"
                      value={formData.minimum_stock}
                      onChange={(e) => setFormData({...formData, minimum_stock: parseInt(e.target.value)})}
                      className="border-gray-300"
                      placeholder="Alerta quando atingir"
                    />
                  </div>
                </div>
                <p className="text-sm text-orange-700 flex items-center gap-2">
                  ⚠️ O sistema vai alertar automaticamente quando o estoque atingir o mínimo
                </p>
              </>
            )}

            {formData.type === "servico" && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Label htmlFor="labor_cost">Custo de Mão de Obra (R$)</Label>
                <Input
                  id="labor_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.labor_cost}
                  onChange={(e) => setFormData({...formData, labor_cost: parseFloat(e.target.value)})}
                  className="border-gray-300"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={2}
                className="border-gray-300"
                placeholder="Detalhes sobre o serviço ou peça..."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="template_reminder_message">Mensagem de Lembrete (WhatsApp)</Label>
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Usar template pronto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="troca_oleo">🚗 Troca de Óleo</SelectItem>
                    <SelectItem value="revisao">🔧 Revisão Periódica</SelectItem>
                    <SelectItem value="troca_freio">⚠️ Troca de Freio</SelectItem>
                    <SelectItem value="alinhamento">🛞 Alinhamento e Balanceamento</SelectItem>
                    <SelectItem value="troca_filtro">🌬️ Troca de Filtros</SelectItem>
                    <SelectItem value="ar_condicionado">❄️ Ar Condicionado</SelectItem>
                    <SelectItem value="troca_correia">⚙️ Troca de Correia</SelectItem>
                    <SelectItem value="troca_bateria">🔋 Troca de Bateria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                id="template_reminder_message"
                value={formData.template_reminder_message}
                onChange={(e) => setFormData({...formData, template_reminder_message: e.target.value})}
                rows={4}
                className="border-gray-300"
                placeholder="Digite uma mensagem personalizada ou selecione um template acima..."
              />
              <p className="text-xs text-gray-500">
                💡 Esta mensagem será usada automaticamente nos lembretes deste serviço/peça
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                <Save className="w-4 h-4 mr-2" />
                {item ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}