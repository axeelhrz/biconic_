export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  etl_output: {
    Tables: {
      dw_facturacion: {
        Row: {
          _import_id: string | null
          customer_birthdate: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_gender: string | null
          customer_id: string | null
          customer_start_date: string | null
          employee_id: string | null
          etl_id: string | null
          facturaci_n: number | null
          first_name: string | null
          join_3_product_name_es: string | null
          last_name: string | null
          location: string | null
          loyalty_card_number: string | null
          neighborhood: string | null
          position: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_unit_price: string | null
          quantity_sold: string | null
          start_date: string | null
          store_address: string | null
          store_city: string | null
          store_id: string | null
          store_latitude: string | null
          store_longitude: string | null
          store_postal_code: string | null
          store_square_feet: string | null
          store_state_province: string | null
          store_type: string | null
          transaction_date: string | null
          unit_price: string | null
        }
        Insert: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturaci_n?: number | null
          first_name?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_unit_price?: string | null
          quantity_sold?: string | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
          transaction_date?: string | null
          unit_price?: string | null
        }
        Update: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturaci_n?: number | null
          first_name?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_unit_price?: string | null
          quantity_sold?: string | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
          transaction_date?: string | null
          unit_price?: string | null
        }
        Relationships: []
      }
      dw_facturacion2: {
        Row: {
          _import_id: string | null
          customer_birthdate: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_gender: string | null
          customer_id: string | null
          customer_start_date: string | null
          employee_id: string | null
          etl_id: string | null
          facturacion: number | null
          first_name: string | null
          join_3_categoria_es: string | null
          join_3_product_name_es: string | null
          last_name: string | null
          location: string | null
          loyalty_card_number: string | null
          neighborhood: string | null
          position: string | null
          primary_quantity_sold: number | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: number | null
          start_date: string | null
          store_address: string | null
          store_city: string | null
          store_id: string | null
          store_latitude: string | null
          store_longitude: string | null
          store_postal_code: string | null
          store_square_feet: string | null
          store_state_province: string | null
          store_type: string | null
        }
        Insert: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturacion?: number | null
          first_name?: string | null
          join_3_categoria_es?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: number | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
        }
        Update: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturacion?: number | null
          first_name?: string | null
          join_3_categoria_es?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: number | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
        }
        Relationships: []
      }
      dw_facturacion3: {
        Row: {
          categoria_es: string | null
          conteo: number | null
          etl_id: string | null
        }
        Insert: {
          categoria_es?: string | null
          conteo?: number | null
          etl_id?: string | null
        }
        Update: {
          categoria_es?: string | null
          conteo?: number | null
          etl_id?: string | null
        }
        Relationships: []
      }
      dw_margenes: {
        Row: {
          categoria_producto: string | null
          costos_totales: number | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: string | null
          margen: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          costos_totales?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          costos_totales?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      dw_sobrino: {
        Row: {
          etl_id: string | null
          join_0_store_address: string | null
          join_0_store_city: string | null
          join_0_store_type: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          join_0_store_address?: string | null
          join_0_store_city?: string | null
          join_0_store_type?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          join_0_store_address?: string | null
          join_0_store_city?: string | null
          join_0_store_type?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Relationships: []
      }
      dw_sov21: {
        Row: {
          audiencia: number | null
          empresa_rel_: string | null
          etl_id: string | null
          fecha_de_publicaci_n_en_medio: string | null
          nissan_competencia: string | null
          nombre_del_medio: string | null
          pais_del_medio: string | null
          referencia: string | null
          tier: number | null
        }
        Insert: {
          audiencia?: number | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          nissan_competencia?: string | null
          nombre_del_medio?: string | null
          pais_del_medio?: string | null
          referencia?: string | null
          tier?: number | null
        }
        Update: {
          audiencia?: number | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          nissan_competencia?: string | null
          nombre_del_medio?: string | null
          pais_del_medio?: string | null
          referencia?: string | null
          tier?: number | null
        }
        Relationships: []
      }
      dw_ventasconcosto: {
        Row: {
          costo_total: number | null
          etl_id: string | null
          facturacion: number | null
          ganacia_perdida: string | null
          join_0_store_city: string | null
          join_1_customer_birthdate: string | null
          join_1_customer_first_name: string | null
          join_1_customer_gender: string | null
          margen: number | null
          primary_fix_costs: string | null
          primary_productos: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: string | null
          primary_variable_cost: number | null
          transaction_date: string | null
        }
        Insert: {
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          ganacia_perdida?: string | null
          join_0_store_city?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          margen?: number | null
          primary_fix_costs?: string | null
          primary_productos?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
          primary_variable_cost?: number | null
          transaction_date?: string | null
        }
        Update: {
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          ganacia_perdida?: string | null
          join_0_store_city?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          margen?: number | null
          primary_fix_costs?: string | null
          primary_productos?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
          primary_variable_cost?: number | null
          transaction_date?: string | null
        }
        Relationships: []
      }
      dw_ventasconcostos: {
        Row: {
          categoria_producto: string | null
          costo_total: number | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: string | null
          margen: number | null
          margen_: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          margen_?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          margen_?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      dw_ventaslimpias: {
        Row: {
          costo_total: number | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: string | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      dw_ventass2: {
        Row: {
          categoria_producto: string | null
          costo_total: number | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: string | null
          margen: number | null
          margen__: number | null
          productos: string | null
          quantity_sold: number | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          margen__?: number | null
          productos?: string | null
          quantity_sold?: number | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          margen?: number | null
          margen__?: number | null
          productos?: string | null
          quantity_sold?: number | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      dw_ventassss: {
        Row: {
          categoria_producto: string | null
          costos: number | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: string | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          costos?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          costos?: number | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      facturacion4: {
        Row: {
          _import_id: string | null
          customer_birthdate: string | null
          customer_email: string | null
          customer_first_name: string | null
          customer_gender: string | null
          customer_id: string | null
          customer_start_date: string | null
          employee_id: string | null
          etl_id: string | null
          facturacion: number | null
          first_name: string | null
          join_3_categoria_es: string | null
          join_3_product_name_es: string | null
          last_name: string | null
          location: string | null
          loyalty_card_number: string | null
          neighborhood: string | null
          position: string | null
          primary_quantity_sold: number | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: number | null
          start_date: string | null
          store_address: string | null
          store_city: string | null
          store_id: string | null
          store_latitude: string | null
          store_longitude: string | null
          store_postal_code: string | null
          store_square_feet: string | null
          store_state_province: string | null
          store_type: string | null
        }
        Insert: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturacion?: number | null
          first_name?: string | null
          join_3_categoria_es?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: number | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
        }
        Update: {
          _import_id?: string | null
          customer_birthdate?: string | null
          customer_email?: string | null
          customer_first_name?: string | null
          customer_gender?: string | null
          customer_id?: string | null
          customer_start_date?: string | null
          employee_id?: string | null
          etl_id?: string | null
          facturacion?: number | null
          first_name?: string | null
          join_3_categoria_es?: string | null
          join_3_product_name_es?: string | null
          last_name?: string | null
          location?: string | null
          loyalty_card_number?: string | null
          neighborhood?: string | null
          position?: string | null
          primary_quantity_sold?: number | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
          start_date?: string | null
          store_address?: string | null
          store_city?: string | null
          store_id?: string | null
          store_latitude?: string | null
          store_longitude?: string | null
          store_postal_code?: string | null
          store_square_feet?: string | null
          store_state_province?: string | null
          store_type?: string | null
        }
        Relationships: []
      }
      facturacionfinal: {
        Row: {
          conteo: number | null
          etl_id: string | null
          product_name_es: string | null
        }
        Insert: {
          conteo?: number | null
          etl_id?: string | null
          product_name_es?: string | null
        }
        Update: {
          conteo?: number | null
          etl_id?: string | null
          product_name_es?: string | null
        }
        Relationships: []
      }
      facturaprovincia: {
        Row: {
          etl_id: string | null
          facturacion: number | null
          join_0_store_city: string | null
          primary_quantity_sold: number | null
          primary_store_id: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: number | null
        }
        Insert: {
          etl_id?: string | null
          facturacion?: number | null
          join_0_store_city?: string | null
          primary_quantity_sold?: number | null
          primary_store_id?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
        }
        Update: {
          etl_id?: string | null
          facturacion?: number | null
          join_0_store_city?: string | null
          primary_quantity_sold?: number | null
          primary_store_id?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: number | null
        }
        Relationships: []
      }
      prueba_cast_date: {
        Row: {
          etl_id: string | null
          join_0_categoria_es: string | null
          join_0_product_group: string | null
          join_0_product_name_es: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_unit_price: string | null
          total_factura: number | null
        }
        Insert: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_name_es?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
          total_factura?: number | null
        }
        Update: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_name_es?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
          total_factura?: number | null
        }
        Relationships: []
      }
      prueba_reunion_martin: {
        Row: {
          audiencia: number | null
          etl_id: string | null
          referencia: string | null
          suma: number | null
        }
        Insert: {
          audiencia?: number | null
          etl_id?: string | null
          referencia?: string | null
          suma?: number | null
        }
        Update: {
          audiencia?: number | null
          etl_id?: string | null
          referencia?: string | null
          suma?: number | null
        }
        Relationships: []
      }
      prueba16_12_2025: {
        Row: {
          categoria_producto: string | null
          cond_1: boolean | null
          customer_firstname: string | null
          etl_id: string | null
          fix_costs: string | null
          new_column_1: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      run_20251024T18094_3a1e1a38: {
        Row: {
          etl_id: string | null
          left_quantity_sold: string | null
          left_transaction_id: string | null
          left_unit_price: string | null
          right_product_name_es: string | null
        }
        Insert: {
          etl_id?: string | null
          left_quantity_sold?: string | null
          left_transaction_id?: string | null
          left_unit_price?: string | null
          right_product_name_es?: string | null
        }
        Update: {
          etl_id?: string | null
          left_quantity_sold?: string | null
          left_transaction_id?: string | null
          left_unit_price?: string | null
          right_product_name_es?: string | null
        }
        Relationships: []
      }
      run_20251024T18525_943131e4: {
        Row: {
          etl_id: string | null
          left_quantity_sold: string | null
          left_transaction_id: string | null
          left_unit_price: string | null
          right_product_name_es: string | null
        }
        Insert: {
          etl_id?: string | null
          left_quantity_sold?: string | null
          left_transaction_id?: string | null
          left_unit_price?: string | null
          right_product_name_es?: string | null
        }
        Update: {
          etl_id?: string | null
          left_quantity_sold?: string | null
          left_transaction_id?: string | null
          left_unit_price?: string | null
          right_product_name_es?: string | null
        }
        Relationships: []
      }
      run_20251024T22001_43e88726: {
        Row: {
          etl_id: string | null
          left_product_id: string | null
          left_quantity_sold: string | null
          right_product_name_es: string | null
        }
        Insert: {
          etl_id?: string | null
          left_product_id?: string | null
          left_quantity_sold?: string | null
          right_product_name_es?: string | null
        }
        Update: {
          etl_id?: string | null
          left_product_id?: string | null
          left_quantity_sold?: string | null
          right_product_name_es?: string | null
        }
        Relationships: []
      }
      run_20251024T22470_8db5d8fc: {
        Row: {
          etl_id: string | null
          left_product_id: string | null
          left_quantity_sold: string | null
          right_product_name_es: string | null
        }
        Insert: {
          etl_id?: string | null
          left_product_id?: string | null
          left_quantity_sold?: string | null
          right_product_name_es?: string | null
        }
        Update: {
          etl_id?: string | null
          left_product_id?: string | null
          left_quantity_sold?: string | null
          right_product_name_es?: string | null
        }
        Relationships: []
      }
      run_20251024T23042_2c312962: {
        Row: {
          etl_id: string | null
          left_product_id: string | null
          sum_1: number | null
        }
        Insert: {
          etl_id?: string | null
          left_product_id?: string | null
          sum_1?: number | null
        }
        Update: {
          etl_id?: string | null
          left_product_id?: string | null
          sum_1?: number | null
        }
        Relationships: []
      }
      run_20251027T18535_e032a625: {
        Row: {
          etl_id: string | null
          product_id: string | null
          quantity_sold: string | null
          unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          product_id?: string | null
          quantity_sold?: string | null
          unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          product_id?: string | null
          quantity_sold?: string | null
          unit_price?: string | null
        }
        Relationships: []
      }
      run_20251107T18031_50501adc: {
        Row: {
          etl_id: string | null
          join_0_categoria_es: string | null
          join_0_product_name_es: string | null
          join_1_customer_birthdate: string | null
          join_1_customer_email: string | null
          join_1_customer_first_name: string | null
          join_1_customer_gender: string | null
          join_1_customer_start_date: string | null
          join_1_loyalty_card_number: string | null
          join_2_first_name: string | null
          join_2_last_name: string | null
          join_2_location: string | null
          join_2_position: string | null
          join_2_start_date: string | null
          join_3_neighborhood: string | null
          join_3_store_address: string | null
          join_3_store_city: string | null
          join_3_store_latitude: string | null
          join_3_store_longitude: string | null
          join_3_store_postal_code: string | null
          join_3_store_square_feet: string | null
          join_3_store_state_province: string | null
          join_3_store_type: string | null
          primary_promo: string | null
          primary_quantity_sold: string | null
          primary_transaction_id: string | null
          primary_unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Relationships: []
      }
      run_20251107T18084_5c78d9e5: {
        Row: {
          etl_id: string | null
          join_0_categoria_es: string | null
          join_0_product_name_es: string | null
          join_1_customer_birthdate: string | null
          join_1_customer_email: string | null
          join_1_customer_first_name: string | null
          join_1_customer_gender: string | null
          join_1_customer_start_date: string | null
          join_1_loyalty_card_number: string | null
          join_2_first_name: string | null
          join_2_last_name: string | null
          join_2_location: string | null
          join_2_position: string | null
          join_2_start_date: string | null
          join_3_neighborhood: string | null
          join_3_store_address: string | null
          join_3_store_city: string | null
          join_3_store_latitude: string | null
          join_3_store_longitude: string | null
          join_3_store_postal_code: string | null
          join_3_store_square_feet: string | null
          join_3_store_state_province: string | null
          join_3_store_type: string | null
          primary_promo: string | null
          primary_quantity_sold: string | null
          primary_transaction_id: string | null
          primary_unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_id?: string | null
          primary_unit_price?: string | null
        }
        Relationships: []
      }
      run_20251107T19424_4e3a6d68: {
        Row: {
          etl_id: string | null
          join_0_categoria_es: string | null
          join_0_product_group: string | null
          join_0_product_id: string | null
          join_0_product_name_es: string | null
          join_1_customer_birthdate: string | null
          join_1_customer_email: string | null
          join_1_customer_first_name: string | null
          join_1_customer_gender: string | null
          join_1_customer_id: string | null
          join_1_customer_start_date: string | null
          join_1_loyalty_card_number: string | null
          join_1_store_id: string | null
          join_2_employee_id: string | null
          join_2_first_name: string | null
          join_2_last_name: string | null
          join_2_location: string | null
          join_2_position: string | null
          join_2_start_date: string | null
          join_3_neighborhood: string | null
          join_3_store_address: string | null
          join_3_store_city: string | null
          join_3_store_id: string | null
          join_3_store_latitude: string | null
          join_3_store_longitude: string | null
          join_3_store_postal_code: string | null
          join_3_store_square_feet: string | null
          join_3_store_state_province: string | null
          join_3_store_type: string | null
          primary_promo: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_type_sale: string | null
          primary_unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_id?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_id?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_1_store_id?: string | null
          join_2_employee_id?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_id?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_type_sale?: string | null
          primary_unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_id?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_id?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_1_store_id?: string | null
          join_2_employee_id?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_id?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_type_sale?: string | null
          primary_unit_price?: string | null
        }
        Relationships: []
      }
      run_20251107T19521_e7c1cdad: {
        Row: {
          etl_id: string | null
          join_0_categoria_es: string | null
          join_0_product_group: string | null
          join_0_product_id: string | null
          join_0_product_name_es: string | null
          join_1_customer_birthdate: string | null
          join_1_customer_email: string | null
          join_1_customer_first_name: string | null
          join_1_customer_gender: string | null
          join_1_customer_id: string | null
          join_1_customer_start_date: string | null
          join_1_loyalty_card_number: string | null
          join_1_store_id: string | null
          join_2_employee_id: string | null
          join_2_first_name: string | null
          join_2_last_name: string | null
          join_2_location: string | null
          join_2_position: string | null
          join_2_start_date: string | null
          join_3_neighborhood: string | null
          join_3_store_address: string | null
          join_3_store_city: string | null
          join_3_store_id: string | null
          join_3_store_latitude: string | null
          join_3_store_longitude: string | null
          join_3_store_postal_code: string | null
          join_3_store_square_feet: string | null
          join_3_store_state_province: string | null
          join_3_store_type: string | null
          primary_promo: string | null
          primary_quantity_sold: string | null
          primary_transaction_date: string | null
          primary_transaction_id: string | null
          primary_type_sale: string | null
          primary_unit_price: string | null
        }
        Insert: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_id?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_id?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_1_store_id?: string | null
          join_2_employee_id?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_id?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_type_sale?: string | null
          primary_unit_price?: string | null
        }
        Update: {
          etl_id?: string | null
          join_0_categoria_es?: string | null
          join_0_product_group?: string | null
          join_0_product_id?: string | null
          join_0_product_name_es?: string | null
          join_1_customer_birthdate?: string | null
          join_1_customer_email?: string | null
          join_1_customer_first_name?: string | null
          join_1_customer_gender?: string | null
          join_1_customer_id?: string | null
          join_1_customer_start_date?: string | null
          join_1_loyalty_card_number?: string | null
          join_1_store_id?: string | null
          join_2_employee_id?: string | null
          join_2_first_name?: string | null
          join_2_last_name?: string | null
          join_2_location?: string | null
          join_2_position?: string | null
          join_2_start_date?: string | null
          join_3_neighborhood?: string | null
          join_3_store_address?: string | null
          join_3_store_city?: string | null
          join_3_store_id?: string | null
          join_3_store_latitude?: string | null
          join_3_store_longitude?: string | null
          join_3_store_postal_code?: string | null
          join_3_store_square_feet?: string | null
          join_3_store_state_province?: string | null
          join_3_store_type?: string | null
          primary_promo?: string | null
          primary_quantity_sold?: string | null
          primary_transaction_date?: string | null
          primary_transaction_id?: string | null
          primary_type_sale?: string | null
          primary_unit_price?: string | null
        }
        Relationships: []
      }
      run_20251110T17055_1a04916a: {
        Row: {
          audiencia: number | null
          autores: string | null
          comunicado: string | null
          contenido_multimedia: string | null
          dimension_cm2: string | null
          empresa_rel_: string | null
          etl_id: string | null
          fecha_de_publicaci_n_en_medio: string | null
          gesti_n: string | null
          modelo: string | null
          moneda: string | null
          new_column_1: number | null
          nombre_del_medio: string | null
          nombre_vocero: string | null
          nro__pagina: string | null
          num__de_caracteres: string | null
          pais_del_medio: string | null
          pilar: string | null
          presencia_en_portada_principal_o_suplemento: string | null
          presencia_en_t_tulo__marca_modelo_: string | null
          prominencia: string | null
          referencia: string | null
          scoring: string | null
          secci_n: string | null
          t_tulo: string | null
          tema: string | null
          tier: string | null
          tipo_de_medio: string | null
          tono: string | null
          url__streaming___imagen_: string | null
          url_nota: string | null
          valor_de_la_nota: number | null
          valor_en_dolares: string | null
        }
        Insert: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          new_column_1?: number | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Update: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          new_column_1?: number | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Relationships: []
      }
      run_20251110T17090_fea62773: {
        Row: {
          audiencia: number | null
          autores: string | null
          comunicado: string | null
          contenido_multimedia: string | null
          dimension_cm2: string | null
          empresa_rel_: string | null
          etl_id: string | null
          fecha_de_publicaci_n_en_medio: string | null
          gesti_n: string | null
          modelo: string | null
          moneda: string | null
          new_column_1: number | null
          nombre_del_medio: string | null
          nombre_vocero: string | null
          nro__pagina: string | null
          num__de_caracteres: string | null
          pais_del_medio: string | null
          pilar: string | null
          presencia_en_portada_principal_o_suplemento: string | null
          presencia_en_t_tulo__marca_modelo_: string | null
          prominencia: string | null
          referencia: string | null
          scoring: string | null
          secci_n: string | null
          t_tulo: string | null
          tema: string | null
          tier: string | null
          tipo_de_medio: string | null
          tono: string | null
          url__streaming___imagen_: string | null
          url_nota: string | null
          valor_de_la_nota: number | null
          valor_en_dolares: string | null
        }
        Insert: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          new_column_1?: number | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Update: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          new_column_1?: number | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Relationships: []
      }
      run_20251110T17160_f00c4044: {
        Row: {
          audiencia: number | null
          autores: string | null
          comunicado: string | null
          contenido_multimedia: string | null
          dimension_cm2: string | null
          empresa_rel_: string | null
          etl_id: string | null
          fecha_de_publicaci_n_en_medio: string | null
          gesti_n: string | null
          modelo: string | null
          moneda: string | null
          nombre_del_medio: string | null
          nombre_vocero: string | null
          nro__pagina: string | null
          num__de_caracteres: string | null
          pais_del_medio: string | null
          pilar: string | null
          presencia_en_portada_principal_o_suplemento: string | null
          presencia_en_t_tulo__marca_modelo_: string | null
          prominencia: string | null
          referencia: string | null
          scoring: string | null
          secci_n: string | null
          t_tulo: string | null
          tema: string | null
          tier: string | null
          tipo_de_medio: string | null
          tono: string | null
          total: number | null
          url__streaming___imagen_: string | null
          url_nota: string | null
          valor_de_la_nota: number | null
          valor_en_dolares: string | null
        }
        Insert: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          total?: number | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Update: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          total?: number | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Relationships: []
      }
      run_20251216T22124_4ed252e3: {
        Row: {
          categoria_producto: string | null
          cond_1: boolean | null
          customer_firstname: string | null
          etl_id: string | null
          fix_costs: string | null
          new_column_1: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      tabla: {
        Row: {
          audiencia: number | null
          autores: string | null
          comunicado: string | null
          contenido_multimedia: string | null
          dimension_cm2: string | null
          empresa_rel_: string | null
          etl_id: string | null
          fecha_de_publicaci_n_en_medio: string | null
          gesti_n: string | null
          modelo: string | null
          moneda: string | null
          nombre_del_medio: string | null
          nombre_vocero: string | null
          nro__pagina: string | null
          num__de_caracteres: string | null
          pais_del_medio: string | null
          pilar: string | null
          presencia_en_portada_principal_o_suplemento: string | null
          presencia_en_t_tulo__marca_modelo_: string | null
          prominencia: string | null
          referencia: string | null
          scoring: string | null
          secci_n: string | null
          t_tulo: string | null
          tema: string | null
          tier: string | null
          tipo_de_medio: string | null
          tono: string | null
          total_nuevo: number | null
          url__streaming___imagen_: string | null
          url_nota: string | null
          valor_de_la_nota: number | null
          valor_en_dolares: string | null
        }
        Insert: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          total_nuevo?: number | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Update: {
          audiencia?: number | null
          autores?: string | null
          comunicado?: string | null
          contenido_multimedia?: string | null
          dimension_cm2?: string | null
          empresa_rel_?: string | null
          etl_id?: string | null
          fecha_de_publicaci_n_en_medio?: string | null
          gesti_n?: string | null
          modelo?: string | null
          moneda?: string | null
          nombre_del_medio?: string | null
          nombre_vocero?: string | null
          nro__pagina?: string | null
          num__de_caracteres?: string | null
          pais_del_medio?: string | null
          pilar?: string | null
          presencia_en_portada_principal_o_suplemento?: string | null
          presencia_en_t_tulo__marca_modelo_?: string | null
          prominencia?: string | null
          referencia?: string | null
          scoring?: string | null
          secci_n?: string | null
          t_tulo?: string | null
          tema?: string | null
          tier?: string | null
          tipo_de_medio?: string | null
          tono?: string | null
          total_nuevo?: number | null
          url__streaming___imagen_?: string | null
          url_nota?: string | null
          valor_de_la_nota?: number | null
          valor_en_dolares?: string | null
        }
        Relationships: []
      }
      tabla1: {
        Row: {
          audiencia: number | null
          etl_id: string | null
          new_column_1: number | null
          referencia: string | null
        }
        Insert: {
          audiencia?: number | null
          etl_id?: string | null
          new_column_1?: number | null
          referencia?: string | null
        }
        Update: {
          audiencia?: number | null
          etl_id?: string | null
          new_column_1?: number | null
          referencia?: string | null
        }
        Relationships: []
      }
      tablas: {
        Row: {
          categoria_producto: string | null
          cond_1: boolean | null
          cond_2: boolean | null
          cond_3: boolean | null
          cond_4: boolean | null
          customer_firstname: string | null
          etl_id: string | null
          fix_costs: string | null
          new_column_1: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          cond_2?: boolean | null
          cond_3?: boolean | null
          cond_4?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          cond_2?: boolean | null
          cond_3?: boolean | null
          cond_4?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      tablas_inteligente: {
        Row: {
          categoria_producto: string | null
          cond_1: boolean | null
          cond_2: boolean | null
          cond_3: boolean | null
          cond_4: boolean | null
          customer_firstname: string | null
          etl_id: string | null
          fix_costs: string | null
          new_column_1: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          cond_2?: boolean | null
          cond_3?: boolean | null
          cond_4?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          cond_2?: boolean | null
          cond_3?: boolean | null
          cond_4?: boolean | null
          customer_firstname?: string | null
          etl_id?: string | null
          fix_costs?: string | null
          new_column_1?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      ventas_completo: {
        Row: {
          categoria_producto: string | null
          cond_1: boolean | null
          costos_totales: number | null
          customer_firstname: string | null
          customer_gender: string | null
          etl_id: string | null
          facturacion: number | null
          fix_costs: number | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          costos_totales?: number | null
          customer_firstname?: string | null
          customer_gender?: string | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          cond_1?: boolean | null
          costos_totales?: number | null
          customer_firstname?: string | null
          customer_gender?: string | null
          etl_id?: string | null
          facturacion?: number | null
          fix_costs?: number | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
      ventas_limpias: {
        Row: {
          categoria_producto: string | null
          costo_total: number | null
          etl_id: string | null
          facturaci_n: number | null
          fix_costs: string | null
          productos: string | null
          quantity_sold: string | null
          tienda: string | null
          tipo_de_venta: string | null
          transaction_date: string | null
          transaction_id: string | null
          unit_price: string | null
          variable_cost: number | null
        }
        Insert: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturaci_n?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          tipo_de_venta?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Update: {
          categoria_producto?: string | null
          costo_total?: number | null
          etl_id?: string | null
          facturaci_n?: number | null
          fix_costs?: string | null
          productos?: string | null
          quantity_sold?: string | null
          tienda?: string | null
          tipo_de_venta?: string | null
          transaction_date?: string | null
          transaction_id?: string | null
          unit_price?: string | null
          variable_cost?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_run_table: {
        Args: { columns_definition: Json; table_name: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_preference_alerts: {
        Row: {
          created_at: string
          enabled: boolean | null
          id: string
          type: string | null
          user_Id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean | null
          id?: string
          type?: string | null
          user_Id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean | null
          id?: string
          type?: string | null
          user_Id?: string | null
        }
        Relationships: []
      }
      admin_preference_notifications: {
        Row: {
          created_at: string
          enabled: boolean | null
          id: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean | null
          id?: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean | null
          id?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          actor_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_resource: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_resource: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_resource?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_members: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean | null
          role: Database["public"]["Enums"]["client_role"]
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["client_role"]
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          role?: Database["public"]["Enums"]["client_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          capital: string | null
          company_name: string | null
          contact_email: string | null
          country_id: string | null
          created_at: string
          id: string
          identification_number: string | null
          identification_type: string | null
          individual_full_name: string | null
          logo_url: string | null
          province_id: string | null
          status: string
          type: Database["public"]["Enums"]["client_type"]
        }
        Insert: {
          address?: string | null
          capital?: string | null
          company_name?: string | null
          contact_email?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          identification_number?: string | null
          identification_type?: string | null
          individual_full_name?: string | null
          logo_url?: string | null
          province_id?: string | null
          status?: string
          type: Database["public"]["Enums"]["client_type"]
        }
        Update: {
          address?: string | null
          capital?: string | null
          company_name?: string | null
          contact_email?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          identification_number?: string | null
          identification_type?: string | null
          individual_full_name?: string | null
          logo_url?: string | null
          province_id?: string | null
          status?: string
          type?: Database["public"]["Enums"]["client_type"]
        }
        Relationships: [
          {
            foreignKeyName: "clients_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_province_id_fkey"
            columns: ["province_id"]
            isOneToOne: false
            referencedRelation: "provinces"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_has_permissions: {
        Row: {
          client_member_id: string | null
          connection_id: string | null
          created_at: string | null
          id: string
          permission_type:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Insert: {
          client_member_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          id?: string
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Update: {
          client_member_id?: string | null
          connection_id?: string | null
          created_at?: string | null
          id?: string
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_has_permissions_client_member_id_fkey"
            columns: ["client_member_id"]
            isOneToOne: false
            referencedRelation: "client_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_has_permissions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          client_id: string | null
          created_at: string
          db_host: string | null
          db_name: string | null
          db_password_secret_id: string | null
          db_port: number | null
          db_user: string | null
          id: string
          name: string
          original_file_name: string | null
          storage_object_path: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          db_host?: string | null
          db_name?: string | null
          db_password_secret_id?: string | null
          db_port?: number | null
          db_user?: string | null
          id?: string
          name: string
          original_file_name?: string | null
          storage_object_path?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          db_host?: string | null
          db_name?: string | null
          db_password_secret_id?: string | null
          db_port?: number | null
          db_user?: string | null
          id?: string
          name?: string
          original_file_name?: string | null
          storage_object_path?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          id: string
          iso_code: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          iso_code?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          iso_code?: string | null
          name?: string
        }
        Relationships: []
      }
      dashboard: {
        Row: {
          client_id: string
          created_at: string
          description: string | null
          etl_id: string | null
          global_filters_config: Json | null
          id: string
          layout: Json | null
          share_token: string | null
          title: string | null
          user_id: string | null
          visibility: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description?: string | null
          etl_id?: string | null
          global_filters_config?: Json | null
          id?: string
          layout?: Json | null
          share_token?: string | null
          title?: string | null
          user_id?: string | null
          visibility?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string | null
          etl_id?: string | null
          global_filters_config?: Json | null
          id?: string
          layout?: Json | null
          share_token?: string | null
          title?: string | null
          user_id?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_etl_id_fkey"
            columns: ["etl_id"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_has_client_permissions: {
        Row: {
          client_member_id: string | null
          created_at: string
          dashboard_id: string | null
          id: string
          is_active: boolean | null
          permission_type:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Insert: {
          client_member_id?: string | null
          created_at?: string
          dashboard_id?: string | null
          id?: string
          is_active?: boolean | null
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Update: {
          client_member_id?: string | null
          created_at?: string
          dashboard_id?: string | null
          id?: string
          is_active?: boolean | null
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_has_client_permissions_client_member_id_fkey"
            columns: ["client_member_id"]
            isOneToOne: false
            referencedRelation: "client_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_has_client_permissions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_has_nodes: {
        Row: {
          created_at: string
          dashboard_id: string | null
          dashboard_node_id: string | null
          id: number
        }
        Insert: {
          created_at?: string
          dashboard_id?: string | null
          dashboard_node_id?: string | null
          id?: number
        }
        Update: {
          created_at?: string
          dashboard_id?: string | null
          dashboard_node_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_has_nodes_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_has_nodes_dashboard_node_id_fkey"
            columns: ["dashboard_node_id"]
            isOneToOne: false
            referencedRelation: "dashboard_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_nodes: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      dashboard_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          dashboard_id: string
          global_filters_config: Json | null
          id: string
          layout: Json | null
          version_name: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          dashboard_id: string
          global_filters_config?: Json | null
          id?: string
          layout?: Json | null
          version_name?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          dashboard_id?: string
          global_filters_config?: Json | null
          id?: string
          layout?: Json | null
          version_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_versions_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboard"
            referencedColumns: ["id"]
          },
        ]
      }
      data_tables: {
        Row: {
          columns: Json | null
          connection_id: string
          created_at: string
          error_message: string | null
          id: string
          import_status: string
          physical_schema_name: string
          physical_table_name: string
          total_rows: number | null
          updated_at: string
        }
        Insert: {
          columns?: Json | null
          connection_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_status?: string
          physical_schema_name?: string
          physical_table_name: string
          total_rows?: number | null
          updated_at?: string
        }
        Update: {
          columns?: Json | null
          connection_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          import_status?: string
          physical_schema_name?: string
          physical_table_name?: string
          total_rows?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_tables_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      etl: {
        Row: {
          client_id: string | null
          connection_id: string | null
          created_at: string
          id: string
          layout: Json | null
          name: string
          output_table: string | null
          published: boolean
          status: string
          title: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          layout?: Json | null
          name: string
          output_table?: string | null
          published: boolean
          status: string
          title: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          layout?: Json | null
          name?: string
          output_table?: string | null
          published?: boolean
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etl_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etl_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_data_warehouse: {
        Row: {
          created_at: string
          data: Json | null
          etl_id: string | null
          id: number
          name: string | null
        }
        Insert: {
          created_at?: string
          data?: Json | null
          etl_id?: string | null
          id?: number
          name?: string | null
        }
        Update: {
          created_at?: string
          data?: Json | null
          etl_id?: string | null
          id?: number
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etl_data_wherehouse_etl_id_fkey"
            columns: ["etl_id"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_has_nodes: {
        Row: {
          created_at: string
          etl: string | null
          etl_nodes: string | null
          id: string
        }
        Insert: {
          created_at?: string
          etl?: string | null
          etl_nodes?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          etl?: string | null
          etl_nodes?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_etl_fkey"
            columns: ["etl"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_etl_nodes_fkey"
            columns: ["etl_nodes"]
            isOneToOne: false
            referencedRelation: "etl_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_has_permissions: {
        Row: {
          client_member_id: string | null
          created_at: string | null
          etl_id: string | null
          id: string
          permission_type:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Insert: {
          client_member_id?: string | null
          created_at?: string | null
          etl_id?: string | null
          id?: string
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Update: {
          client_member_id?: string | null
          created_at?: string | null
          etl_id?: string | null
          id?: string
          permission_type?:
            | Database["public"]["Enums"]["app_permission_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "etl_has_permissions_client_member_id_fkey"
            columns: ["client_member_id"]
            isOneToOne: false
            referencedRelation: "client_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etl_has_permissions_etl_id_fkey"
            columns: ["etl_id"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_nodes: {
        Row: {
          created_at: string
          etl: string | null
          id: string
        }
        Insert: {
          created_at?: string
          etl?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          etl?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "etl_nodes_etl_fkey"
            columns: ["etl"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
        ]
      }
      etl_runs_log: {
        Row: {
          completed_at: string | null
          created_at: string
          destination_schema: string
          destination_table_name: string
          error_message: string | null
          etl_id: string | null
          id: string
          rows_processed: number | null
          started_at: string
          status: Database["public"]["Enums"]["etl_run_status"]
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          destination_schema: string
          destination_table_name: string
          error_message?: string | null
          etl_id?: string | null
          id?: string
          rows_processed?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["etl_run_status"]
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          destination_schema?: string
          destination_table_name?: string
          error_message?: string | null
          etl_id?: string | null
          id?: string
          rows_processed?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["etl_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "etl_runs_log_etl_id_fkey"
            columns: ["etl_id"]
            isOneToOne: false
            referencedRelation: "etl"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          created_at: string | null
          feature_key: string
          feature_value: string
          feature_value_type: string
          id: string
          plan_id: string
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          feature_value: string
          feature_value_type: string
          id?: string
          plan_id: string
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          feature_value?: string
          feature_value_type?: string
          id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price_monthly: number | null
          price_yearly: number | null
          trial_days: number | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          trial_days?: number | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          trial_days?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          app_role: Database["public"]["Enums"]["app_role"]
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          role: string | null
        }
        Insert: {
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          role?: string | null
        }
        Update: {
          app_role?: Database["public"]["Enums"]["app_role"]
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          role?: string | null
        }
        Relationships: []
      }
      provinces: {
        Row: {
          country_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "provinces_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          client_id: string
          created_at: string | null
          current_period_end: string
          current_period_start: string
          external_subscription_id: string | null
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string | null
        }
        Insert: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          client_id: string
          created_at?: string | null
          current_period_end: string
          current_period_start?: string
          external_subscription_id?: string | null
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string | null
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          client_id?: string
          created_at?: string | null
          current_period_end?: string
          current_period_start?: string
          external_subscription_id?: string | null
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_member_to_client: {
        Args: {
          p_client_id: string
          p_job_title: string
          p_user_full_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      check_warehouse_table_exists: {
        Args: { p_table_name: string }
        Returns: boolean
      }
      check_warehouse_table_status: {
        Args: { p_table_name: string }
        Returns: {
          row_count: number
          sample_columns: string[]
          table_exists: boolean
        }[]
      }
      create_client_and_member_transaction: {
        Args: {
          p_address: string
          p_capital: string
          p_client_type: string
          p_company_name: string
          p_contact_email: string
          p_country_id: string
          p_identification_number: string
          p_identification_type: string
          p_individual_full_name: string
          p_job_title: string
          p_plan_id: string
          p_province_id: string
          p_user_full_name: string
          p_user_id: string
        }
        Returns: string
      }
      execute_complete_warehouse_join: {
        Args: {
          p_join_conditions: Json
          p_join_type?: string
          p_left_table: string
          p_right_table: string
          p_selected_columns?: Json
        }
        Returns: {
          joined_row: Json
        }[]
      }
      execute_real_warehouse_join: {
        Args: {
          p_join_conditions: Json
          p_join_type?: string
          p_left_table: string
          p_limit?: number
          p_right_table: string
          p_selected_columns?: Json
        }
        Returns: {
          joined_row: Json
        }[]
      }
      execute_sql: { Args: { sql_query: string }; Returns: Json[] }
      execute_warehouse_join: {
        Args: {
          p_left_column: string
          p_left_table: string
          p_limit: number
          p_right_column: string
          p_right_table: string
        }
        Returns: {
          join_result: Json
        }[]
      }
      get_all_warehouse_data: {
        Args: { p_table_name: string }
        Returns: {
          data_row: Json
        }[]
      }
      get_real_warehouse_data: {
        Args: { p_limit?: number; p_table_name: string }
        Returns: {
          data_row: Json
        }[]
      }
      get_warehouse_sample_data: {
        Args: { p_limit?: number; p_table_name: string }
        Returns: {
          sample_data: Json
        }[]
      }
      get_warehouse_table_columns: {
        Args: { p_table_name: string }
        Returns: {
          col_default: string
          col_name: string
          col_nullable: string
          col_type: string
        }[]
      }
      get_warehouse_table_data: {
        Args: { p_limit: number; p_table_name: string }
        Returns: {
          row_data: Json
        }[]
      }
    }
    Enums: {
      app_permission_type: "VIEW" | "UPDATE"
      app_role: "APP_ADMIN" | "CREATOR" | "VIEWER"
      billing_interval: "month" | "year"
      client_member_permission_types: "VIEW" | "UPDATE"
      client_role: "admin" | "editor" | "viewer"
      client_type: "empresa" | "individuo"
      etl_run_status: "started" | "completed" | "failed"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "expired"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  etl_output: {
    Enums: {},
  },
  public: {
    Enums: {
      app_permission_type: ["VIEW", "UPDATE"],
      app_role: ["APP_ADMIN", "CREATOR", "VIEWER"],
      billing_interval: ["month", "year"],
      client_member_permission_types: ["VIEW", "UPDATE"],
      client_role: ["admin", "editor", "viewer"],
      client_type: ["empresa", "individuo"],
      etl_run_status: ["started", "completed", "failed"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "expired",
      ],
    },
  },
} as const
