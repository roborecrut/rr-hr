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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_runs: {
        Row: {
          candidate_id: string | null
          cost_rr: number | null
          created_at: string
          employer_id: string | null
          endpoint: string
          error: string | null
          id: string
          input: Json | null
          model: string | null
          output: Json | null
          project_id: string | null
          status: string | null
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
        }
        Insert: {
          candidate_id?: string | null
          cost_rr?: number | null
          created_at?: string
          employer_id?: string | null
          endpoint: string
          error?: string | null
          id?: string
          input?: Json | null
          model?: string | null
          output?: Json | null
          project_id?: string | null
          status?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Update: {
          candidate_id?: string | null
          cost_rr?: number | null
          created_at?: string
          employer_id?: string | null
          endpoint?: string
          error?: string | null
          id?: string
          input?: Json | null
          model?: string | null
          output?: Json | null
          project_id?: string | null
          status?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_chats: {
        Row: {
          created_at: string
          id: string
          kind: string
          messages: Json
          scope_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          messages?: Json
          scope_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          messages?: Json
          scope_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          meta: Json | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          meta?: Json | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      candidate_answers: {
        Row: {
          answer_text: string | null
          candidate_id: string
          created_at: string
          feedback: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          score: number | null
        }
        Insert: {
          answer_text?: string | null
          candidate_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          score?: number | null
        }
        Update: {
          answer_text?: string | null
          candidate_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_answers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "project_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "public_project_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_scores: {
        Row: {
          assessment_summary: string | null
          candidate_id: string
          checklist_points: number | null
          checklist_score: number | null
          checklist_sys_score: number | null
          interview_score: number | null
          overall_score: number | null
          resume_score: number | null
          roleplay_points: number | null
          situations_score: number | null
          updated_at: string
        }
        Insert: {
          assessment_summary?: string | null
          candidate_id: string
          checklist_points?: number | null
          checklist_score?: number | null
          checklist_sys_score?: number | null
          interview_score?: number | null
          overall_score?: number | null
          resume_score?: number | null
          roleplay_points?: number | null
          situations_score?: number | null
          updated_at?: string
        }
        Update: {
          assessment_summary?: string | null
          candidate_id?: string
          checklist_points?: number | null
          checklist_score?: number | null
          checklist_sys_score?: number | null
          interview_score?: number | null
          overall_score?: number | null
          resume_score?: number | null
          roleplay_points?: number | null
          situations_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_scores_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_sessions: {
        Row: {
          candidate_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_sessions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_stage_progress: {
        Row: {
          attempts: number
          best_score: number
          candidate_id: string
          created_at: string
          last_answers: Json | null
          last_feedback: Json | null
          last_score: number | null
          passed_at: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          best_score?: number
          candidate_id: string
          created_at?: string
          last_answers?: Json | null
          last_feedback?: Json | null
          last_score?: number | null
          passed_at?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          best_score?: number
          candidate_id?: string
          created_at?: string
          last_answers?: Json | null
          last_feedback?: Json | null
          last_score?: number | null
          passed_at?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_stage_progress_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_stages_history: {
        Row: {
          candidate_id: string
          changed_by: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["candidate_stage"] | null
          id: string
          note: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Insert: {
          candidate_id: string
          changed_by?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          note?: string | null
          to_stage: Database["public"]["Enums"]["candidate_stage"]
        }
        Update: {
          candidate_id?: string
          changed_by?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["candidate_stage"] | null
          id?: string
          note?: string | null
          to_stage?: Database["public"]["Enums"]["candidate_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "candidate_stages_history_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_training_progress: {
        Row: {
          answers: Json | null
          candidate_id: string
          created_at: string
          finished_at: string | null
          id: string
          is_completed: boolean
          lesson_id: string
          passed: boolean | null
          quiz_feedback: string | null
          score: number | null
        }
        Insert: {
          answers?: Json | null
          candidate_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          is_completed?: boolean
          lesson_id: string
          passed?: boolean | null
          quiz_feedback?: string | null
          score?: number | null
        }
        Update: {
          answers?: Json | null
          candidate_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          is_completed?: boolean
          lesson_id?: string
          passed?: boolean | null
          quiz_feedback?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_training_progress_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_training_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          auth_kind: string
          avatar_url: string | null
          company_id: string | null
          created_at: string
          crm_stage: Database["public"]["Enums"]["crm_stage"]
          crm_stage_manual: boolean
          current_stage: Database["public"]["Enums"]["candidate_stage"]
          email: string | null
          id: string
          landing_slug: string | null
          last_login_at: string | null
          legacy_public_id: string | null
          password_hash: string | null
          phone: string | null
          project_id: string | null
          public_id: string | null
          ref_source: string | null
          referrer_employer_id: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name: string | null
          resume_text: string | null
          resume_url: string | null
          role_name: string | null
          social_github: string | null
          social_instagram: string | null
          social_max: string | null
          social_setka: string | null
          social_telegram: string | null
          social_vk: string | null
          social_whatsapp: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth_kind?: string
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          crm_stage?: Database["public"]["Enums"]["crm_stage"]
          crm_stage_manual?: boolean
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          email?: string | null
          id?: string
          landing_slug?: string | null
          last_login_at?: string | null
          legacy_public_id?: string | null
          password_hash?: string | null
          phone?: string | null
          project_id?: string | null
          public_id?: string | null
          ref_source?: string | null
          referrer_employer_id?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          resume_url?: string | null
          role_name?: string | null
          social_github?: string | null
          social_instagram?: string | null
          social_max?: string | null
          social_setka?: string | null
          social_telegram?: string | null
          social_vk?: string | null
          social_whatsapp?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth_kind?: string
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          crm_stage?: Database["public"]["Enums"]["crm_stage"]
          crm_stage_manual?: boolean
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          email?: string | null
          id?: string
          landing_slug?: string | null
          last_login_at?: string | null
          legacy_public_id?: string | null
          password_hash?: string | null
          phone?: string | null
          project_id?: string | null
          public_id?: string | null
          ref_source?: string | null
          referrer_employer_id?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          resume_url?: string | null
          role_name?: string | null
          social_github?: string | null
          social_instagram?: string | null
          social_max?: string | null
          social_setka?: string | null
          social_telegram?: string | null
          social_vk?: string | null
          social_whatsapp?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidates_referrer_employer_id_fkey"
            columns: ["referrer_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      certifications: {
        Row: {
          candidate_id: string
          certificate_url: string | null
          id: string
          issued_at: string
          meta: Json | null
          project_id: string | null
        }
        Insert: {
          candidate_id: string
          certificate_url?: string | null
          id?: string
          issued_at?: string
          meta?: Json | null
          project_id?: string | null
        }
        Update: {
          candidate_id?: string
          certificate_url?: string | null
          id?: string
          issued_at?: string
          meta?: Json | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certifications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: Json
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: Json
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: Json
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          about_text: string | null
          created_at: string
          description_text: string | null
          id: string
          industry: string | null
          is_published: boolean
          legacy_public_id: string | null
          legacy_slug: string | null
          logo_url: string | null
          mission_text: string | null
          name: string
          owner_employer_id: string
          payouts_text: string | null
          products_text: string | null
          public_id: string | null
          schedule_text: string | null
          slug: string | null
          staff: string | null
          stats: Json
          status: string
          system_text: string | null
          team_text: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          about_text?: string | null
          created_at?: string
          description_text?: string | null
          id?: string
          industry?: string | null
          is_published?: boolean
          legacy_public_id?: string | null
          legacy_slug?: string | null
          logo_url?: string | null
          mission_text?: string | null
          name: string
          owner_employer_id: string
          payouts_text?: string | null
          products_text?: string | null
          public_id?: string | null
          schedule_text?: string | null
          slug?: string | null
          staff?: string | null
          stats?: Json
          status?: string
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          about_text?: string | null
          created_at?: string
          description_text?: string | null
          id?: string
          industry?: string | null
          is_published?: boolean
          legacy_public_id?: string | null
          legacy_slug?: string | null
          logo_url?: string | null
          mission_text?: string | null
          name?: string
          owner_employer_id?: string
          payouts_text?: string | null
          products_text?: string | null
          public_id?: string | null
          schedule_text?: string | null
          slug?: string | null
          staff?: string | null
          stats?: Json
          status?: string
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_employer_id_fkey"
            columns: ["owner_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      company_pages: {
        Row: {
          company_id: string
          content: Json
          created_at: string
          id: string
          page_key: string
          title: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          content?: Json
          created_at?: string
          id?: string
          page_key: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          content?: Json
          created_at?: string
          id?: string
          page_key?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_pages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          author_id: string | null
          candidate_id: string
          created_at: string
          id: string
          text: string
        }
        Insert: {
          author_id?: string | null
          candidate_id: string
          created_at?: string
          id?: string
          text: string
        }
        Update: {
          author_id?: string | null
          candidate_id?: string
          created_at?: string
          id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      employers: {
        Row: {
          bonus_granted: boolean
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_telegram: string | null
          created_at: string
          id: string
          interview_credits: number
          interview_setup_credits: number
          landing_credits: number
          legacy_public_id: string | null
          plan: string | null
          public_id: string | null
          ref_by: string | null
          status: string | null
          training_credits: number
          training_setup_credits: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_telegram?: string | null
          created_at?: string
          id?: string
          interview_credits?: number
          interview_setup_credits?: number
          landing_credits?: number
          legacy_public_id?: string | null
          plan?: string | null
          public_id?: string | null
          ref_by?: string | null
          status?: string | null
          training_credits?: number
          training_setup_credits?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_telegram?: string | null
          created_at?: string
          id?: string
          interview_credits?: number
          interview_setup_credits?: number
          landing_credits?: number
          legacy_public_id?: string | null
          plan?: string | null
          public_id?: string | null
          ref_by?: string | null
          status?: string | null
          training_credits?: number
          training_setup_credits?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      interview_messages: {
        Row: {
          created_at: string
          id: string
          interview_id: string
          sender: Database["public"]["Enums"]["message_sender"]
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          interview_id: string
          sender: Database["public"]["Enums"]["message_sender"]
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          interview_id?: string
          sender?: Database["public"]["Enums"]["message_sender"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          candidate_id: string
          created_at: string
          finished_at: string | null
          id: string
          legacy_public_id: string | null
          project_id: string | null
          public_id: string | null
          started_at: string
          status: string
          transcript_text: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          legacy_public_id?: string | null
          project_id?: string | null
          public_id?: string | null
          started_at?: string
          status?: string
          transcript_text?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          legacy_public_id?: string | null
          project_id?: string | null
          public_id?: string | null
          started_at?: string
          status?: string
          transcript_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          created_at: string
          created_by: string | null
          field_templates: Json
          id: string
          interview_template: Json
          is_basic: boolean
          title: string
          title_norm: string | null
          usage_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_templates?: Json
          id?: string
          interview_template?: Json
          is_basic?: boolean
          title: string
          title_norm?: string | null
          usage_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_templates?: Json
          id?: string
          interview_template?: Json
          is_basic?: boolean
          title?: string
          title_norm?: string | null
          usage_count?: number
        }
        Relationships: []
      }
      logs: {
        Row: {
          api_key: string | null
          bot_id: string | null
          bot_reply: string | null
          channel_id: string | null
          channel_name: string | null
          created_at: string | null
          function_call_params: string | null
          function_error: string | null
          id: number
          llm: string | null
          server_name: string | null
          tokens_in_source: number | null
          tokens_out_source: number | null
          tokens_total: number | null
          tokens_user: number | null
          user_message: string | null
          user_social_id: string | null
        }
        Insert: {
          api_key?: string | null
          bot_id?: string | null
          bot_reply?: string | null
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string | null
          function_call_params?: string | null
          function_error?: string | null
          id?: never
          llm?: string | null
          server_name?: string | null
          tokens_in_source?: number | null
          tokens_out_source?: number | null
          tokens_total?: number | null
          tokens_user?: number | null
          user_message?: string | null
          user_social_id?: string | null
        }
        Update: {
          api_key?: string | null
          bot_id?: string | null
          bot_reply?: string | null
          channel_id?: string | null
          channel_name?: string | null
          created_at?: string | null
          function_call_params?: string | null
          function_error?: string | null
          id?: never
          llm?: string | null
          server_name?: string | null
          tokens_in_source?: number | null
          tokens_out_source?: number | null
          tokens_total?: number | null
          tokens_user?: number | null
          user_message?: string | null
          user_social_id?: string | null
        }
        Relationships: []
      }
      messages_recruiter: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          sender: Database["public"]["Enums"]["message_sender"]
          text: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          sender: Database["public"]["Enums"]["message_sender"]
          text: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          sender?: Database["public"]["Enums"]["message_sender"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recruiter_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          employer_id: string
          external_id: string | null
          id: string
          provider: string
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          employer_id: string
          external_id?: string | null
          id?: string
          provider: string
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          employer_id?: string
          external_id?: string | null
          id?: string
          provider?: string
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_kinds: string[]
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          google_email: string | null
          id: string
          last_signup_intent: string | null
          locale: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          updated_at: string
        }
        Insert: {
          account_kinds?: string[]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id: string
          last_signup_intent?: string | null
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          updated_at?: string
        }
        Update: {
          account_kinds?: string[]
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id?: string
          last_signup_intent?: string | null
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          updated_at?: string
        }
        Relationships: []
      }
      project_checklist_items: {
        Row: {
          created_at: string
          id: string
          order_index: number
          project_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          project_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          project_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_checklist_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_landings: {
        Row: {
          created_at: string
          hero: Json
          id: string
          project_id: string
          published_at: string | null
          sections: Json
          slug: string
          theme: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hero?: Json
          id?: string
          project_id: string
          published_at?: string | null
          sections?: Json
          slug: string
          theme?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hero?: Json
          id?: string
          project_id?: string
          published_at?: string | null
          sections?: Json
          slug?: string
          theme?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_landings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_questions: {
        Row: {
          category: Database["public"]["Enums"]["question_category"]
          correct_answer: string | null
          created_at: string
          explanation: string | null
          id: string
          material_content: string | null
          material_title: string | null
          options: Json
          order_index: number
          project_id: string
          question: string
          type: Database["public"]["Enums"]["quiz_type"]
        }
        Insert: {
          category: Database["public"]["Enums"]["question_category"]
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          material_content?: string | null
          material_title?: string | null
          options?: Json
          order_index?: number
          project_id: string
          question: string
          type?: Database["public"]["Enums"]["quiz_type"]
        }
        Update: {
          category?: Database["public"]["Enums"]["question_category"]
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          material_content?: string | null
          material_title?: string | null
          options?: Json
          order_index?: number
          project_id?: string
          question?: string
          type?: Database["public"]["Enums"]["quiz_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_roleplay_items: {
        Row: {
          created_at: string
          id: string
          order_index: number
          project_id: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          project_id: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          project_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_roleplay_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          cabinet_tabs_text: string | null
          company_id: string | null
          company_text: string | null
          created_at: string
          created_tasks: boolean
          custom_wiki: string | null
          employer_id: string
          id: string
          is_published: boolean
          legacy_public_id: string | null
          legacy_slug: string | null
          logo_url: string | null
          max_interviews: number | null
          max_trainings: number | null
          mission_text: string | null
          motivation_text: string | null
          motivation_text_detail: string | null
          onboarding_text: string | null
          payouts_text: string | null
          public_id: string | null
          role_name: string
          salary_terms: string | null
          schedule_terms: string | null
          schedule_text: string | null
          slug: string | null
          stats: Json
          system_text: string | null
          tasks_activity_text: string | null
          team_text: string | null
          training_intro_text: string | null
          training_product_text: string | null
          training_prof_text: string | null
          training_professional_text: string | null
          training_published: boolean
          training_regulations_text: string | null
          training_system_text: string | null
          training_systems_text: string | null
          training_wiki_text: string | null
          updated_at: string
          vacancy_text: string | null
        }
        Insert: {
          cabinet_tabs_text?: string | null
          company_id?: string | null
          company_text?: string | null
          created_at?: string
          created_tasks?: boolean
          custom_wiki?: string | null
          employer_id: string
          id?: string
          is_published?: boolean
          legacy_public_id?: string | null
          legacy_slug?: string | null
          logo_url?: string | null
          max_interviews?: number | null
          max_trainings?: number | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          public_id?: string | null
          role_name: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_intro_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_professional_text?: string | null
          training_published?: boolean
          training_regulations_text?: string | null
          training_system_text?: string | null
          training_systems_text?: string | null
          training_wiki_text?: string | null
          updated_at?: string
          vacancy_text?: string | null
        }
        Update: {
          cabinet_tabs_text?: string | null
          company_id?: string | null
          company_text?: string | null
          created_at?: string
          created_tasks?: boolean
          custom_wiki?: string | null
          employer_id?: string
          id?: string
          is_published?: boolean
          legacy_public_id?: string | null
          legacy_slug?: string | null
          logo_url?: string | null
          max_interviews?: number | null
          max_trainings?: number | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          public_id?: string | null
          role_name?: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_intro_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_professional_text?: string | null
          training_published?: boolean
          training_regulations_text?: string | null
          training_system_text?: string | null
          training_systems_text?: string | null
          training_wiki_text?: string | null
          updated_at?: string
          vacancy_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals_emp: {
        Row: {
          bonus_units: number
          created_at: string
          id: string
          referred_employer_id: string
          referrer_employer_id: string
        }
        Insert: {
          bonus_units?: number
          created_at?: string
          id?: string
          referred_employer_id: string
          referrer_employer_id: string
        }
        Update: {
          bonus_units?: number
          created_at?: string
          id?: string
          referred_employer_id?: string
          referrer_employer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_emp_referred_employer_id_fkey"
            columns: ["referred_employer_id"]
            isOneToOne: true
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_emp_referrer_employer_id_fkey"
            columns: ["referrer_employer_id"]
            isOneToOne: false
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
      test_connection: {
        Row: {
          created_at: string
          id: number
          status: string
          test_name: string
        }
        Insert: {
          created_at?: string
          id?: never
          status?: string
          test_name?: string
        }
        Update: {
          created_at?: string
          id?: never
          status?: string
          test_name?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          ai_generated_at: string | null
          block_key: string | null
          created_at: string
          description: string | null
          id: string
          legacy_public_id: string | null
          materials_files: Json | null
          materials_links: Json | null
          materials_md: string | null
          motivation_text_detail: string | null
          onboarding_text: string | null
          order_index: number
          pass_score: number | null
          project_id: string
          public_id: string | null
          stage: string
          title: string
          total_score: number | null
          training_professional_text: string | null
          training_regulations_text: string | null
          training_systems_text: string | null
          training_wiki_text: string | null
          updated_at: string
        }
        Insert: {
          ai_generated_at?: string | null
          block_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legacy_public_id?: string | null
          materials_files?: Json | null
          materials_links?: Json | null
          materials_md?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          order_index?: number
          pass_score?: number | null
          project_id: string
          public_id?: string | null
          stage?: string
          title: string
          total_score?: number | null
          training_professional_text?: string | null
          training_regulations_text?: string | null
          training_systems_text?: string | null
          training_wiki_text?: string | null
          updated_at?: string
        }
        Update: {
          ai_generated_at?: string | null
          block_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          legacy_public_id?: string | null
          materials_files?: Json | null
          materials_links?: Json | null
          materials_md?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          order_index?: number
          pass_score?: number | null
          project_id?: string
          public_id?: string | null
          stage?: string
          title?: string
          total_score?: number | null
          training_professional_text?: string | null
          training_regulations_text?: string | null
          training_systems_text?: string | null
          training_wiki_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lessons: {
        Row: {
          block_id: string
          content: string | null
          created_at: string
          id: string
          order_index: number
          title: string
        }
        Insert: {
          block_id: string
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          title: string
        }
        Update: {
          block_id?: string
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          block_id: string
          created_at: string
          expected_answer: string | null
          explanation: string | null
          id: string
          kind: string
          options: Json
          order_no: number
          points: number
          question: string
          updated_at: string
        }
        Insert: {
          block_id: string
          created_at?: string
          expected_answer?: string | null
          explanation?: string | null
          id?: string
          kind: string
          options?: Json
          order_no?: number
          points?: number
          question: string
          updated_at?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          expected_answer?: string | null
          explanation?: string | null
          id?: string
          kind?: string
          options?: Json
          order_no?: number
          points?: number
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      training_quizzes: {
        Row: {
          correct_answer: string | null
          created_at: string
          explanation: string | null
          id: string
          lesson_id: string
          options: Json
          order_index: number
          question: string
          type: Database["public"]["Enums"]["quiz_type"]
        }
        Insert: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          lesson_id: string
          options?: Json
          order_index?: number
          question: string
          type?: Database["public"]["Enums"]["quiz_type"]
        }
        Update: {
          correct_answer?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          lesson_id?: string
          options?: Json
          order_index?: number
          question?: string
          type?: Database["public"]["Enums"]["quiz_type"]
        }
        Relationships: [
          {
            foreignKeyName: "training_quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      training_stage_tests: {
        Row: {
          ai_generated_at: string | null
          created_at: string
          id: string
          pass_score: number
          project_id: string
          questions: Json
          stage: string
          total_score: number
          updated_at: string
        }
        Insert: {
          ai_generated_at?: string | null
          created_at?: string
          id?: string
          pass_score?: number
          project_id: string
          questions?: Json
          stage: string
          total_score?: number
          updated_at?: string
        }
        Update: {
          ai_generated_at?: string | null
          created_at?: string
          id?: string
          pass_score?: number
          project_id?: string
          questions?: Json
          stage?: string
          total_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_stage_tests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_rr: number
          created_at: string
          id: string
          idem_key: string | null
          note: string | null
          ref_id: string | null
          ref_table: string | null
          type: Database["public"]["Enums"]["tx_type"]
          wallet_id: string
        }
        Insert: {
          amount_rr: number
          created_at?: string
          id?: string
          idem_key?: string | null
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          wallet_id: string
        }
        Update: {
          amount_rr?: number
          created_at?: string
          id?: string
          idem_key?: string | null
          note?: string | null
          ref_id?: string | null
          ref_table?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          created_at: string
          employer_id: string
          id: string
          units_balance: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          employer_id: string
          id?: string
          units_balance?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          employer_id?: string
          id?: string
          units_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_employer_id_fkey"
            columns: ["employer_id"]
            isOneToOne: true
            referencedRelation: "employers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_project_questions: {
        Row: {
          category: Database["public"]["Enums"]["question_category"] | null
          created_at: string | null
          id: string | null
          material_content: string | null
          material_title: string | null
          options: Json | null
          order_index: number | null
          project_id: string | null
          question: string | null
          type: Database["public"]["Enums"]["quiz_type"] | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["question_category"] | null
          created_at?: string | null
          id?: string | null
          material_content?: string | null
          material_title?: string | null
          options?: Json | null
          order_index?: number | null
          project_id?: string | null
          question?: string | null
          type?: Database["public"]["Enums"]["quiz_type"] | null
        }
        Update: {
          category?: Database["public"]["Enums"]["question_category"] | null
          created_at?: string | null
          id?: string | null
          material_content?: string | null
          material_title?: string | null
          options?: Json | null
          order_index?: number | null
          project_id?: string | null
          question?: string | null
          type?: Database["public"]["Enums"]["quiz_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      public_training_quizzes: {
        Row: {
          created_at: string | null
          id: string | null
          lesson_id: string | null
          options: Json | null
          order_index: number | null
          question: string | null
          type: Database["public"]["Enums"]["quiz_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "training_quizzes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_delete_job_title: { Args: { _id: string }; Returns: Json }
      admin_job_title_upsert_interview_template: {
        Args: { _overwrite?: boolean; _patch: Json; _title: string }
        Returns: Json
      }
      admin_job_title_upsert_templates: {
        Args: {
          _is_basic?: boolean
          _overwrite?: boolean
          _patch: Json
          _title: string
        }
        Returns: Json
      }
      admin_list_candidates: { Args: never; Returns: Json }
      admin_list_employers: { Args: never; Returns: Json }
      admin_list_job_titles: {
        Args: never
        Returns: {
          created_at: string
          field_templates: Json
          id: string
          is_basic: boolean
          title: string
          title_norm: string
          usage_count: number
        }[]
      }
      admin_list_users: { Args: never; Returns: Json }
      admin_set_role: {
        Args: {
          _enabled: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: Json
      }
      admin_wallet_adjust: {
        Args: { _delta: number; _employer: string; _note: string }
        Returns: Json
      }
      apply_transaction: {
        Args: {
          _amount: number
          _employer: string
          _note?: string
          _ref_id?: string
          _ref_table?: string
          _type: Database["public"]["Enums"]["tx_type"]
        }
        Returns: {
          amount_rr: number
          created_at: string
          id: string
          idem_key: string | null
          note: string | null
          ref_id: string | null
          ref_table: string | null
          type: Database["public"]["Enums"]["tx_type"]
          wallet_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_view_candidate: { Args: { _candidate: string }; Returns: boolean }
      candidate_email_login: {
        Args: { _email: string; _password: string; _project?: string }
        Returns: Json
      }
      candidate_email_signup:
        | {
            Args: {
              _company?: string
              _email: string
              _password: string
              _project: string
            }
            Returns: Json
          }
        | {
            Args: {
              _company?: string
              _email: string
              _password: string
              _phone?: string
              _project: string
            }
            Returns: Json
          }
      candidate_full_details: { Args: { _candidate: string }; Returns: Json }
      candidate_list_applications: {
        Args: { _email: string; _password: string }
        Returns: Json
      }
      candidate_public_cabinet: { Args: { _public_id: string }; Returns: Json }
      candidate_recalc_crm_stage: {
        Args: { _id: string }
        Returns: Database["public"]["Enums"]["crm_stage"]
      }
      candidate_update_profile: {
        Args: {
          _current_password?: string
          _new_email?: string
          _new_password?: string
          _patch?: Json
          _token: string
        }
        Returns: Json
      }
      company_create_draft: { Args: never; Returns: Json }
      company_finalize: { Args: { _id: string }; Returns: Json }
      company_update: { Args: { _id: string; _patch: Json }; Returns: Json }
      employer_set_candidate_crm_stage: {
        Args: {
          _candidate: string
          _stage: Database["public"]["Enums"]["crm_stage"]
        }
        Returns: Json
      }
      get_my_referees: { Args: never; Returns: Json }
      get_my_referrer: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_owner: { Args: { _project: string }; Returns: boolean }
      is_project_published: { Args: { _project: string }; Returns: boolean }
      job_title_get_interview_template: {
        Args: { _title: string }
        Returns: Json
      }
      job_title_get_templates: { Args: { _title: string }; Returns: Json }
      job_title_save_templates: {
        Args: { _patch: Json; _title: string }
        Returns: Json
      }
      job_title_upsert: {
        Args: { _title: string }
        Returns: {
          created_at: string
          created_by: string | null
          field_templates: Json
          id: string
          interview_template: Json
          is_basic: boolean
          title: string
          title_norm: string | null
          usage_count: number
        }
        SetofOptions: {
          from: "*"
          to: "job_titles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      job_titles_list_public: {
        Args: never
        Returns: {
          has_template: boolean
          id: string
          is_basic: boolean
          title: string
          title_norm: string
          usage_count: number
        }[]
      }
      pack_tier_price: { Args: { _qty: number }; Returns: number }
      project_create_draft: { Args: { _company: string }; Returns: Json }
      purchase_fixed: { Args: { _item: string; _qty?: number }; Returns: Json }
      purchase_pack: { Args: { _kind: string; _qty: number }; Returns: Json }
      purchase_pack_mixed: {
        Args: { _qty_int: number; _qty_train: number }
        Returns: Json
      }
      rl_hit: {
        Args: { _key: string; _limit: number; _window_sec: number }
        Returns: boolean
      }
      slugify_ru: { Args: { _input: string }; Returns: string }
      spend_fixed: { Args: { _item: string; _project: string }; Returns: Json }
      spend_pack: { Args: { _candidate: string; _kind: string }; Returns: Json }
      spend_unit: { Args: { _candidate: string; _kind: string }; Returns: Json }
      topup_rr: { Args: { _amount_rub: number }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "employer" | "candidate"
      candidate_stage:
        | "terms"
        | "interview"
        | "scoring"
        | "training"
        | "certified"
      crm_stage:
        | "registration"
        | "screening"
        | "checklist"
        | "situations"
        | "professional"
        | "product"
        | "systems"
        | "certified"
      message_sender: "candidate" | "recruiter" | "ai"
      question_category:
        | "checklist_prof"
        | "checklist_sys"
        | "train_prof"
        | "train_product"
        | "train_sys"
        | "roleplay"
      quiz_type: "select" | "text"
      registration_method: "google" | "telegram" | "email"
      tg_direction: "in" | "out"
      tx_type: "topup" | "purchase" | "bonus" | "refund" | "ai_cost"
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
  public: {
    Enums: {
      app_role: ["admin", "employer", "candidate"],
      candidate_stage: [
        "terms",
        "interview",
        "scoring",
        "training",
        "certified",
      ],
      crm_stage: [
        "registration",
        "screening",
        "checklist",
        "situations",
        "professional",
        "product",
        "systems",
        "certified",
      ],
      message_sender: ["candidate", "recruiter", "ai"],
      question_category: [
        "checklist_prof",
        "checklist_sys",
        "train_prof",
        "train_product",
        "train_sys",
        "roleplay",
      ],
      quiz_type: ["select", "text"],
      registration_method: ["google", "telegram", "email"],
      tg_direction: ["in", "out"],
      tx_type: ["topup", "purchase", "bonus", "refund", "ai_cost"],
    },
  },
} as const
