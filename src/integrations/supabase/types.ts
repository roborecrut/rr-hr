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
          candidate_id: string
          created_at: string
          finished_at: string | null
          id: string
          is_completed: boolean
          lesson_id: string
          quiz_feedback: string | null
          score: number | null
        }
        Insert: {
          candidate_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          is_completed?: boolean
          lesson_id: string
          quiz_feedback?: string | null
          score?: number | null
        }
        Update: {
          candidate_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          is_completed?: boolean
          lesson_id?: string
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
          created_at: string
          current_stage: Database["public"]["Enums"]["candidate_stage"]
          id: string
          landing_slug: string | null
          project_id: string | null
          ref_source: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name: string | null
          resume_text: string | null
          role_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          id?: string
          landing_slug?: string | null
          project_id?: string | null
          ref_source?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          role_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_stage?: Database["public"]["Enums"]["candidate_stage"]
          id?: string
          landing_slug?: string | null
          project_id?: string | null
          ref_source?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          resume_name?: string | null
          resume_text?: string | null
          role_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      companies: {
        Row: {
          about_text: string | null
          created_at: string
          id: string
          is_published: boolean
          logo_url: string | null
          mission_text: string | null
          name: string
          owner_employer_id: string
          payouts_text: string | null
          schedule_text: string | null
          slug: string | null
          stats: Json
          system_text: string | null
          team_text: string | null
          updated_at: string
        }
        Insert: {
          about_text?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          name: string
          owner_employer_id: string
          payouts_text?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
        }
        Update: {
          about_text?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          logo_url?: string | null
          mission_text?: string | null
          name?: string
          owner_employer_id?: string
          payouts_text?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          team_text?: string | null
          updated_at?: string
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
      employers: {
        Row: {
          bonus_granted: boolean
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_tg: string | null
          created_at: string
          id: string
          plan: string | null
          ref_by: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_tg?: string | null
          created_at?: string
          id?: string
          plan?: string | null
          ref_by?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_granted?: boolean
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_tg?: string | null
          created_at?: string
          id?: string
          plan?: string | null
          ref_by?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          google_email: string | null
          id: string
          locale: string | null
          registered_via:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id: string
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          google_email?: string | null
          id?: string
          locale?: string | null
          registered_via?:
            | Database["public"]["Enums"]["registration_method"]
            | null
          telegram_id?: number | null
          telegram_username?: string | null
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
          logo_url: string | null
          mission_text: string | null
          motivation_text: string | null
          motivation_text_detail: string | null
          onboarding_text: string | null
          payouts_text: string | null
          role_name: string
          salary_terms: string | null
          schedule_terms: string | null
          schedule_text: string | null
          slug: string | null
          stats: Json
          system_text: string | null
          tasks_activity_text: string | null
          team_text: string | null
          training_product_text: string | null
          training_prof_text: string | null
          training_system_text: string | null
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
          logo_url?: string | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          role_name: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_system_text?: string | null
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
          logo_url?: string | null
          mission_text?: string | null
          motivation_text?: string | null
          motivation_text_detail?: string | null
          onboarding_text?: string | null
          payouts_text?: string | null
          role_name?: string
          salary_terms?: string | null
          schedule_terms?: string | null
          schedule_text?: string | null
          slug?: string | null
          stats?: Json
          system_text?: string | null
          tasks_activity_text?: string | null
          team_text?: string | null
          training_product_text?: string | null
          training_prof_text?: string | null
          training_system_text?: string | null
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
      telegram_links: {
        Row: {
          auth_date: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          photo_url: string | null
          source: string | null
          telegram_id: number
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          auth_date?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          source?: string | null
          telegram_id: number
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          auth_date?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          photo_url?: string | null
          source?: string | null
          telegram_id?: number
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          description: string | null
          id: string
          order_index: number
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_index?: number
          project_id?: string
          title?: string
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
      transactions: {
        Row: {
          amount_rr: number
          created_at: string
          id: string
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
          balance_rr: number
          created_at: string
          employer_id: string
          hold_rr: number
          id: string
          updated_at: string
        }
        Insert: {
          balance_rr?: number
          created_at?: string
          employer_id: string
          hold_rr?: number
          id?: string
          updated_at?: string
        }
        Update: {
          balance_rr?: number
          created_at?: string
          employer_id?: string
          hold_rr?: number
          id?: string
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
      [_ in never]: never
    }
    Functions: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_project_owner: { Args: { _project: string }; Returns: boolean }
      is_project_published: { Args: { _project: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "employer" | "candidate"
      candidate_stage:
        | "terms"
        | "interview"
        | "scoring"
        | "training"
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
