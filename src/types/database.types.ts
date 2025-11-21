export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
export type status_produto = "ativo" | "inativo"
export type tipo_embalagem = "pacote_caixa" | "envelope" | "rolo_cilindro" | "outro"
export type tipo_produto = "simples" | "kit" | "variacoes" | "fabricado" | "materia_prima"
export type pessoa_tipo = "cliente" | "fornecedor" | "ambos"
export type status_transportadora = "ativa" | "inativa"
export type tipo_pessoa_enum = "fisica" | "juridica" | "estrangeiro"
export type contribuinte_icms_enum = "1" | "2" | "9"
export interface Database {
  public: {
    Tables: {
      addons: {
        Row: {
          id: string
          slug: string
          name: string
          billing_cycle: "monthly" | "yearly"
          currency: string
          amount_cents: number
          stripe_price_id: string
          trial_days: number | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          billing_cycle: "monthly" | "yearly"
          currency?: string
          amount_cents: number
          stripe_price_id: string
          trial_days?: number | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          billing_cycle?: "monthly" | "yearly"
          currency?: string
          amount_cents?: number
          stripe_price_id?: string
          trial_days?: number | null
          active?: boolean
          created_at?: string
        }
      }
      atributos: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          tipo: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          tipo?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          tipo?: string
          created_at?: string
          updated_at?: string
        }
      }
      ecommerces: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          created_at?: string
          updated_at?: string
        }
      }
      empresa_addons: {
        Row: {
          empresa_id: string
          addon_slug: string
          billing_cycle: "monthly" | "yearly"
          status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          empresa_id: string
          addon_slug: string
          billing_cycle: "monthly" | "yearly"
          status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          addon_slug?: string
          billing_cycle?: "monthly" | "yearly"
          status?: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      empresas: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          nome_razao_social: string
          nome_fantasia: string | null
          cnpj: string | null
          logotipo_url: string | null
          telefone: string | null
          email: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_complemento: string | null
          endereco_bairro: string | null
          endereco_cidade: string | null
          endereco_uf: string | null
          endereco_cep: string | null
          stripe_customer_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          nome_razao_social: string
          nome_fantasia?: string | null
          cnpj?: string | null
          logotipo_url?: string | null
          telefone?: string | null
          email?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_uf?: string | null
          endereco_cep?: string | null
          stripe_customer_id?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          nome_razao_social?: string
          nome_fantasia?: string | null
          cnpj?: string | null
          logotipo_url?: string | null
          telefone?: string | null
          email?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_complemento?: string | null
          endereco_bairro?: string | null
          endereco_cidade?: string | null
          endereco_uf?: string | null
          endereco_cep?: string | null
          stripe_customer_id?: string | null
        }
      }
      empresa_usuarios: {
        Row: {
          empresa_id: string
          user_id: string
          role: string
          created_at: string
          is_principal?: boolean | null
        }
        Insert: {
          empresa_id: string
          user_id: string
          role?: string
          created_at?: string
          is_principal?: boolean | null
        }
        Update: {
          empresa_id?: string
          user_id?: string
          role?: string
          created_at?: string
          is_principal?: boolean | null
        }
      }
      fornecedores: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          created_at?: string
          updated_at?: string
        }
      }
      marcas: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          created_at?: string
          updated_at?: string
        }
      }
      plans: {
        Row: {
          id: string
          slug: "START" | "PRO" | "MAX" | "ULTRA"
          name: string
          billing_cycle: "monthly" | "yearly"
          currency: string
          amount_cents: number
          stripe_price_id: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: "START" | "PRO" | "MAX" | "ULTRA"
          name: string
          billing_cycle: "monthly" | "yearly"
          currency?: string
          amount_cents: number
          stripe_price_id: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: "START" | "PRO" | "MAX" | "ULTRA"
          name?: string
          billing_cycle?: "monthly" | "yearly"
          currency?: string
          amount_cents?: number
          stripe_price_id?: string
          active?: boolean
          created_at?: string
        }
      }
      produto_anuncios: {
        Row: {
          id: string
          empresa_id: string
          produto_id: string
          ecommerce_id: string
          identificador: string
          descricao: string | null
          descricao_complementar: string | null
          preco_especifico: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          produto_id: string
          ecommerce_id: string
          identificador: string
          descricao?: string | null
          descricao_complementar?: string | null
          preco_especifico?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          produto_id?: string
          ecommerce_id?: string
          identificador?: string
          descricao?: string | null
          descricao_complementar?: string | null
          preco_especifico?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      produto_atributos: {
        Row: {
          id: string
          empresa_id: string
          produto_id: string
          atributo_id: string
          valor_text: string | null
          valor_num: number | null
          valor_bool: boolean | null
          valor_json: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          produto_id: string
          atributo_id: string
          valor_text?: string | null
          valor_num?: number | null
          valor_bool?: boolean | null
          valor_json?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          produto_id?: string
          atributo_id?: string
          valor_text?: string | null
          valor_num?: number | null
          valor_bool?: boolean | null
          valor_json?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      produto_componentes: {
        Row: {
          kit_id: string
          componente_id: string
          empresa_id: string
          quantidade: number
        }
        Insert: {
          kit_id: string
          componente_id: string
          empresa_id: string
          quantidade: number
        }
        Update: {
          kit_id?: string
          componente_id?: string
          empresa_id?: string
          quantidade?: number
        }
      }
      produto_fornecedores: {
        Row: {
          produto_id: string
          fornecedor_id: string
          empresa_id: string
          codigo_no_fornecedor: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          produto_id: string
          fornecedor_id: string
          empresa_id: string
          codigo_no_fornecedor?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          produto_id?: string
          fornecedor_id?: string
          empresa_id?: string
          codigo_no_fornecedor?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      produto_imagens: {
        Row: {
          id: string
          empresa_id: string
          produto_id: string
          url: string
          ordem: number
          principal: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          produto_id: string
          url: string
          ordem?: number
          principal?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          produto_id?: string
          url?: string
          ordem?: number
          principal?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      produto_tags: {
        Row: {
          produto_id: string
          tag_id: string
          empresa_id: string
        }
        Insert: {
          produto_id: string
          tag_id: string
          empresa_id: string
        }
        Update: {
          produto_id?: string
          tag_id?: string
          empresa_id?: string
        }
      }
      produtos: {
        Row: {
          id: string
          empresa_id: string
          tipo: tipo_produto
          status: status_produto
          nome: string
          descricao: string | null
          sku: string | null
          gtin: string | null
          unidade: string
          preco_venda: number
          moeda: string
          icms_origem: number
          ncm: string | null
          cest: string | null
          tipo_embalagem: tipo_embalagem
          embalagem: string | null
          peso_liquido_kg: number | null
          peso_bruto_kg: number | null
          num_volumes: number | null
          largura_cm: number | null
          altura_cm: number | null
          comprimento_cm: number | null
          diametro_cm: number | null
          controla_estoque: boolean
          estoque_min: number | null
          estoque_max: number | null
          controlar_lotes: boolean
          localizacao: string | null
          dias_preparacao: number | null
          marca_id: string | null
          tabela_medidas_id: string | null
          produto_pai_id: string | null
          descricao_complementar: string | null
          video_url: string | null
          slug: string | null
          seo_titulo: string | null
          seo_descricao: string | null
          keywords: string | null
          created_at: string
          updated_at: string
          itens_por_caixa: number | null
          preco_custo: number | null
          garantia_meses: number | null
          markup: number | null
          permitir_inclusao_vendas: boolean | null
          gtin_tributavel: string | null
          unidade_tributavel: string | null
          fator_conversao: number | null
          codigo_enquadramento_ipi: string | null
          valor_ipi_fixo: number | null
          codigo_enquadramento_legal_ipi: string | null
          ex_tipi: string | null
          observacoes_internas: string | null
        }
        Insert: {
          id?: string
          empresa_id: string
          tipo?: tipo_produto
          status?: status_produto
          nome: string
          descricao?: string | null
          sku?: string | null
          gtin?: string | null
          unidade: string
          preco_venda: number
          moeda?: string
          icms_origem: number
          ncm?: string | null
          cest?: string | null
          tipo_embalagem?: tipo_embalagem
          embalagem?: string | null
          peso_liquido_kg?: number | null
          peso_bruto_kg?: number | null
          num_volumes?: number | null
          largura_cm?: number | null
          altura_cm?: number | null
          comprimento_cm?: number | null
          diametro_cm?: number | null
          controla_estoque?: boolean
          estoque_min?: number | null
          estoque_max?: number | null
          controlar_lotes?: boolean
          localizacao?: string | null
          dias_preparacao?: number | null
          marca_id?: string | null
          tabela_medidas_id?: string | null
          produto_pai_id?: string | null
          descricao_complementar?: string | null
          video_url?: string | null
          slug?: string | null
          seo_titulo?: string | null
          seo_descricao?: string | null
          keywords?: string | null
          created_at?: string
          updated_at?: string
          itens_por_caixa?: number | null
          preco_custo?: number | null
          garantia_meses?: number | null
          markup?: number | null
          permitir_inclusao_vendas?: boolean | null
          gtin_tributavel?: string | null
          unidade_tributavel?: string | null
          fator_conversao?: number | null
          codigo_enquadramento_ipi?: string | null
          valor_ipi_fixo?: number | null
          codigo_enquadramento_legal_ipi?: string | null
          ex_tipi?: string | null
          observacoes_internas?: string | null
        }
        Update: {
          id?: string
          empresa_id?: string
          tipo?: tipo_produto
          status?: status_produto
          nome?: string
          descricao?: string | null
          sku?: string | null
          gtin?: string | null
          unidade?: string
          preco_venda?: number
          moeda?: string
          icms_origem?: number
          ncm?: string | null
          cest?: string | null
          tipo_embalagem?: tipo_embalagem
          embalagem?: string | null
          peso_liquido_kg?: number | null
          peso_bruto_kg?: number | null
          num_volumes?: number | null
          largura_cm?: number | null
          altura_cm?: number | null
          comprimento_cm?: number | null
          diametro_cm?: number | null
          controla_estoque?: boolean
          estoque_min?: number | null
          estoque_max?: number | null
          controlar_lotes?: boolean
          localizacao?: string | null
          dias_preparacao?: number | null
          marca_id?: string | null
          tabela_medidas_id?: string | null
          produto_pai_id?: string | null
          descricao_complementar?: string | null
          video_url?: string | null
          slug?: string | null
          seo_titulo?: string | null
          seo_descricao?: string | null
          keywords?: string | null
          created_at?: string
          updated_at?: string
          itens_por_caixa?: number | null
          preco_custo?: number | null
          garantia_meses?: number | null
          markup?: number | null
          permitir_inclusao_vendas?: boolean | null
          gtin_tributavel?: string | null
          unidade_tributavel?: string | null
          fator_conversao?: number | null
          codigo_enquadramento_ipi?: string | null
          valor_ipi_fixo?: number | null
          codigo_enquadramento_legal_ipi?: string | null
          ex_tipi?: string | null
          observacoes_internas?: string | null
        }
      }
      products_legacy_archive: {
        Row: {
          id: string
          empresa_id: string
          name: string
          sku: string | null
          price_cents: number
          unit: string
          active: boolean
          created_at: string
          updated_at: string
          deleted_at: string
          deleted_by: string | null
          note: string | null
        }
        Insert: {
          id: string
          empresa_id: string
          name: string
          sku?: string | null
          price_cents: number
          unit: string
          active: boolean
          created_at: string
          updated_at: string
          deleted_at?: string
          deleted_by?: string | null
          note?: string | null
        }
        Update: {
          id?: string
          empresa_id?: string
          name?: string
          sku?: string | null
          price_cents?: number
          unit?: string
          active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string
          deleted_by?: string | null
          note?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          nome_completo: string | null
          cpf: string | null
        }
        Insert: {
          id: string
          created_at?: string
          updated_at?: string
          nome_completo?: string | null
          cpf?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          nome_completo?: string | null
          cpf?: string | null
        }
      }
      subscriptions: {
        Row: {
          id: string
          empresa_id: string
          status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          current_period_end: string | null
          created_at: string
          updated_at: string
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          plan_slug: string | null
          billing_cycle: "monthly" | "yearly" | null
          cancel_at_period_end: boolean
        }
        Insert: {
          id?: string
          empresa_id: string
          status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          plan_slug?: string | null
          billing_cycle?: "monthly" | "yearly" | null
          cancel_at_period_end?: boolean
        }
        Update: {
          id?: string
          empresa_id?: string
          status?: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete" | "incomplete_expired"
          current_period_end?: string | null
          created_at?: string
          updated_at?: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          plan_slug?: string | null
          billing_cycle?: "monthly" | "yearly" | null
          cancel_at_period_end?: boolean
        }
      }
      tabelas_medidas: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          created_at?: string
          updated_at?: string
        }
      }
      tags: {
        Row: {
          id: string
          empresa_id: string
          nome: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome?: string
          created_at?: string
          updated_at?: string
        }
      }
      pessoas: {
        Row: {
          id: string
          empresa_id: string
          tipo: Database["public"]["Enums"]["pessoa_tipo"]
          nome: string
          doc_unico: string | null
          email: string | null
          telefone: string | null
          inscr_estadual: string | null
          isento_ie: boolean | null
          inscr_municipal: string | null
          observacoes: string | null
          created_at: string
          updated_at: string
          pessoa_search: any
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa_enum"]
          fantasia: string | null
          codigo_externo: string | null
          contribuinte_icms: Database["public"]["Enums"]["contribuinte_icms_enum"]
          contato_tags: string[] | null
        }
        Insert: {
          id?: string
          empresa_id: string
          tipo: Database["public"]["Enums"]["pessoa_tipo"]
          nome: string
          doc_unico?: string | null
          email?: string | null
          telefone?: string | null
          inscr_estadual?: string | null
          isento_ie?: boolean | null
          inscr_municipal?: string | null
          observacoes?: string | null
          created_at?: string
          updated_at?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa_enum"]
          fantasia?: string | null
          codigo_externo?: string | null
          contribuinte_icms?: Database["public"]["Enums"]["contribuinte_icms_enum"]
          contato_tags?: string[] | null
        }
        Update: {
          id?: string
          empresa_id?: string
          tipo?: Database["public"]["Enums"]["pessoa_tipo"]
          nome?: string
          doc_unico?: string | null
          email?: string | null
          telefone?: string | null
          inscr_estadual?: string | null
          isento_ie?: boolean | null
          inscr_municipal?: string | null
          observacoes?: string | null
          created_at?: string
          updated_at?: string
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa_enum"]
          fantasia?: string | null
          codigo_externo?: string | null
          contribuinte_icms?: Database["public"]["Enums"]["contribuinte_icms_enum"]
          contato_tags?: string[] | null
        }
      }
      user_active_empresa: {
        Row: {
          user_id: string
          empresa_id: string
          updated_at: string
        }
        Insert: {
          user_id: string
          empresa_id: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          empresa_id?: string
          updated_at?: string
        }
      }
      transportadoras: {
        Row: {
          id: string
          empresa_id: string
          nome_razao_social: string
          nome_fantasia: string | null
          cnpj: string | null
          inscr_estadual: string | null
          status: Database["public"]["Enums"]["status_transportadora"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nome_razao_social: string
          nome_fantasia?: string | null
          cnpj?: string | null
          inscr_estadual?: string | null
          status?: Database["public"]["Enums"]["status_transportadora"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          empresa_id?: string
          nome_razao_social?: string
          nome_fantasia?: string | null
          cnpj?: string | null
          inscr_estadual?: string | null
          status?: Database["public"]["Enums"]["status_transportadora"]
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      empresa_features: {
        Row: {
          empresa_id: string | null
          revo_send_enabled: boolean | null
        }
      }
      produtos_compat_view: {
        Row: {
          id: string | null
          empresa_id: string | null
          nome: string | null
          sku: string | null
          preco_venda: number | null
          unidade: string | null
          status: status_produto | null
          created_at: string | null
          updated_at: string | null
        }
      }
    }
    Functions: {
      create_product_for_current_user: {
        Args: { payload: Json }
        Returns: Database["public"]["Tables"]["produtos"]["Row"]
      }
      current_empresa_id: {
        Args: Record<string, unknown>
        Returns: string
      }
      current_user_id: {
        Args: Record<string, unknown>
        Returns: string
      }
      delete_product_for_current_user: {
        Args: { p_id: string }
        Returns: undefined
      }
      delete_product_image_db: {
        Args: { p_image_id: string }
        Returns: undefined
      }
      enforce_same_empresa_pessoa: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      is_user_member_of: {
        Args: { p_empresa_id: string }
        Returns: boolean
      }
      produtos_count_for_current_user: {
        Args: {
          p_q?: string | null
          p_status?: Database["public"]["Enums"]["status_produto"] | null
        }
        Returns: number
      }
      produtos_list_for_current_user: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_q?: string | null
          p_status?: Database["public"]["Enums"]["status_produto"] | null
          p_order?: string
        }
        Returns: {
          id: string
          nome: string
          sku: string
          status: Database["public"]["Enums"]["status_produto"]
          preco_venda: number
          unidade: string
          gtin: string
          slug: string
          updated_at: string
          created_at: string
        }[]
      }
      provision_empresa_for_current_user: {
        Args: {
          p_razao_social: string
          p_fantasia: string
          p_email?: string | null
        }
        Returns: Database["public"]["Tables"]["empresas"]["Row"]
      }
      purge_legacy_products: {
        Args: {
          p_empresa_id: string
          p_dry_run?: boolean
          p_note?: string
        }
        Returns: {
          empresa_id: string
          to_archive_count: number
          purged_count: number
          dry_run: boolean
        }[]
      }
      restore_legacy_products: {
        Args: {
          p_empresa_id: string
          p_max_rows?: number
        }
        Returns: {
          empresa_id: string
          restored_count: number
        }[]
      }
      set_principal_product_image: {
        Args: {
          p_produto_id: string
          p_imagem_id: string
        }
        Returns: undefined
      }
      tg_set_updated_at: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      update_product_for_current_user: {
        Args: { p_id: string; patch: Json }
        Returns: Database["public"]["Tables"]["produtos"]["Row"]
      }
      validate_fiscais: {
        Args: { ncm_in: string; cest_in: string }
        Returns: undefined
      }
      count_partners: {
        Args: {
          p_q?: string | null
          p_tipo?: Database["public"]["Enums"]["pessoa_tipo"] | null
        }
        Returns: number
      }
      create_update_partner: {
        Args: { p_payload: Json }
        Returns: Json
      }
      delete_partner: {
        Args: { p_id: string }
        Returns: undefined
      }
      get_partner_details: {
        Args: { p_id: string }
        Returns: Json
      }
      list_partners: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_q?: string | null
          p_tipo?: Database["public"]["Enums"]["pessoa_tipo"] | null
          p_order?: string
        }
        Returns: {
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["pessoa_tipo"]
          doc_unico: string
          email: string
          created_at: string
          updated_at: string
        }[]
      }
      whoami: {
        Args: Record<string, unknown>
        Returns: Json
      }
      set_active_empresa_for_current_user: {
        Args: { p_empresa_id: string }
        Returns: undefined
      }
      count_carriers: {
        Args: {
          p_q?: string | null
          p_status?: Database["public"]["Enums"]["status_transportadora"] | null
        }
        Returns: number
      }
      create_update_carrier: {
        Args: { p_payload: Json }
        Returns: Database["public"]["Tables"]["transportadoras"]["Row"]
      }
      delete_carrier: {
        Args: { p_id: string }
        Returns: undefined
      }
      get_carrier_details: {
        Args: { p_id: string }
        Returns: Database["public"]["Tables"]["transportadoras"]["Row"]
      }
      list_carriers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_q?: string | null
          p_status?: Database["public"]["Enums"]["status_transportadora"] | null
          p_order?: string
        }
        Returns: {
          id: string
          nome_razao_social: string
          cnpj: string
          inscr_estadual: string
          status: Database["public"]["Enums"]["status_transportadora"]
          created_at: string
        }[]
      }
    }
    Enums: {
      status_produto: "ativo" | "inativo"
      tipo_embalagem: "pacote_caixa" | "envelope" | "rolo_cilindro" | "outro"
      tipo_produto: "simples" | "kit" | "variacoes" | "fabricado" | "materia_prima"
      pessoa_tipo: "cliente" | "fornecedor" | "ambos"
      status_transportadora: "ativa" | "inativa"
      tipo_pessoa_enum: "fisica" | "juridica" | "estrangeiro"
      contribuinte_icms_enum: "1" | "2" | "9"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
