
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "announcements": {
                  Row: {
                    "audience": string,"body": string,"created_at": string,"id": string,"recipient_count": number,"sent_by": string | null,"subject": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audience"?: string,"body": string,"created_at"?: string,"id"?: string,"recipient_count"?: number,"sent_by"?: string | null,"subject": string
                  }
                  Update: {
                    "audience"?: string,"body"?: string,"created_at"?: string,"id"?: string,"recipient_count"?: number,"sent_by"?: string | null,"subject"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "business_name": string,"cancellation_window_hours": number,"credit_validity_days": number | null,"currency": string,"id": number,"max_booking_days_ahead": number,"max_booking_hours": number,"min_booking_notice_hours": number,"payment_hold_minutes": number,"reminder_hours_before": number,"slot_interval_minutes": number,"stripe_cancellation_refund": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "business_name"?: string,"cancellation_window_hours"?: number,"credit_validity_days"?: number | null,"currency"?: string,"id"?: number,"max_booking_days_ahead"?: number,"max_booking_hours"?: number,"min_booking_notice_hours"?: number,"payment_hold_minutes"?: number,"reminder_hours_before"?: number,"slot_interval_minutes"?: number,"stripe_cancellation_refund"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "business_name"?: string,"cancellation_window_hours"?: number,"credit_validity_days"?: number | null,"currency"?: string,"id"?: number,"max_booking_days_ahead"?: number,"max_booking_hours"?: number,"min_booking_notice_hours"?: number,"payment_hold_minutes"?: number,"reminder_hours_before"?: number,"slot_interval_minutes"?: number,"stripe_cancellation_refund"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"availability": {
                  Row: {
                    "active": boolean,"created_at": string,"day_of_week": number,"end_time": string,"id": string,"start_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"day_of_week": number,"end_time": string,"id"?: string,"start_time": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"day_of_week"?: number,"end_time"?: string,"id"?: string,"start_time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"blocked_times": {
                  Row: {
                    "created_at": string,"end_time": string,"id": string,"reason": string | null,"start_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"end_time": string,"id"?: string,"reason"?: string | null,"start_time": string
                  }
                  Update: {
                    "created_at"?: string,"end_time"?: string,"id"?: string,"reason"?: string | null,"start_time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bookings": {
                  Row: {
                    "cancel_reason": string | null,"cancelled_at": string | null,"cancelled_by": string | null,"created_at": string,"end_time": string,"hold_expires_at": string | null,"hours": number,"id": string,"late_cancellation": boolean,"package_purchase_id": string | null,"paid_with": Database["public"]['Enums']["payment_method"],"parent_id": string,"parent_note": string | null,"payment_status": Database["public"]['Enums']["payment_status"],"player_id": string,"price_cents": number | null,"reminder_sent_at": string | null,"session_type_id": string,"slot_key": string,"start_time": string,"status": Database["public"]['Enums']["booking_status"],"stripe_checkout_session_id": string | null,"stripe_payment_intent_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"end_time": string,"hold_expires_at"?: string | null,"hours"?: number,"id"?: string,"late_cancellation"?: boolean,"package_purchase_id"?: string | null,"paid_with": Database["public"]['Enums']["payment_method"],"parent_id": string,"parent_note"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"player_id": string,"price_cents"?: number | null,"reminder_sent_at"?: string | null,"session_type_id": string,"slot_key": string,"start_time": string,"status"?: Database["public"]['Enums']["booking_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"cancelled_at"?: string | null,"cancelled_by"?: string | null,"created_at"?: string,"end_time"?: string,"hold_expires_at"?: string | null,"hours"?: number,"id"?: string,"late_cancellation"?: boolean,"package_purchase_id"?: string | null,"paid_with"?: Database["public"]['Enums']["payment_method"],"parent_id"?: string,"parent_note"?: string | null,"payment_status"?: Database["public"]['Enums']["payment_status"],"player_id"?: string,"price_cents"?: number | null,"reminder_sent_at"?: string | null,"session_type_id"?: string,"slot_key"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["booking_status"],"stripe_checkout_session_id"?: string | null,"stripe_payment_intent_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_cancelled_by_fkey"
      columns: ["cancelled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_package_purchase_id_fkey"
      columns: ["package_purchase_id"]
isOneToOne: false
      referencedRelation: "package_purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_session_type_id_fkey"
      columns: ["session_type_id"]
isOneToOne: false
      referencedRelation: "session_types"
      referencedColumns: ["id"]
    }
                  ]
                },"drills": {
                  Row: {
                    "created_at": string,"description": string | null,"external_url": string | null,"id": string,"skill_tag": string | null,"title": string,"updated_at": string,"video_path": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"external_url"?: string | null,"id"?: string,"skill_tag"?: string | null,"title": string,"updated_at"?: string,"video_path"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"external_url"?: string | null,"id"?: string,"skill_tag"?: string | null,"title"?: string,"updated_at"?: string,"video_path"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"inquiries": {
                  Row: {
                    "created_at": string,"email": string,"id": string,"message": string,"name": string,"phone": string | null,"status": Database["public"]['Enums']["inquiry_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"id"?: string,"message": string,"name": string,"phone"?: string | null,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"id"?: string,"message"?: string,"name"?: string,"phone"?: string | null,"status"?: Database["public"]['Enums']["inquiry_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"package_purchases": {
                  Row: {
                    "amount_paid_cents": number,"created_at": string,"expires_at": string | null,"id": string,"label": string,"package_id": string | null,"parent_id": string,"purchased_at": string,"session_type_id": string | null,"sessions_remaining": number,"sessions_total": number,"source": string,"stripe_checkout_session_id": string | null,"stripe_payment_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid_cents"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label": string,"package_id"?: string | null,"parent_id": string,"purchased_at"?: string,"session_type_id"?: string | null,"sessions_remaining": number,"sessions_total": number,"source"?: string,"stripe_checkout_session_id"?: string | null,"stripe_payment_id"?: string | null
                  }
                  Update: {
                    "amount_paid_cents"?: number,"created_at"?: string,"expires_at"?: string | null,"id"?: string,"label"?: string,"package_id"?: string | null,"parent_id"?: string,"purchased_at"?: string,"session_type_id"?: string | null,"sessions_remaining"?: number,"sessions_total"?: number,"source"?: string,"stripe_checkout_session_id"?: string | null,"stripe_payment_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "package_purchases_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "package_purchases_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "package_purchases_session_type_id_fkey"
      columns: ["session_type_id"]
isOneToOne: false
      referencedRelation: "session_types"
      referencedColumns: ["id"]
    }
                  ]
                },"packages": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"id": string,"name": string,"price_cents": number,"session_count": number,"session_type_id": string | null,"sort_order": number,"updated_at": string,"validity_days": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"price_cents": number,"session_count": number,"session_type_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"price_cents"?: number,"session_count"?: number,"session_type_id"?: string | null,"sort_order"?: number,"updated_at"?: string,"validity_days"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "packages_session_type_id_fkey"
      columns: ["session_type_id"]
isOneToOne: false
      referencedRelation: "session_types"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number,"amount_refunded_cents": number,"booking_id": string | null,"created_at": string,"currency": string,"id": string,"package_purchase_id": string | null,"parent_id": string | null,"refunded_at": string | null,"status": string,"stripe_checkout_session_id": string,"stripe_payment_intent_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"amount_refunded_cents"?: number,"booking_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"package_purchase_id"?: string | null,"parent_id"?: string | null,"refunded_at"?: string | null,"status"?: string,"stripe_checkout_session_id": string,"stripe_payment_intent_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"amount_refunded_cents"?: number,"booking_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"package_purchase_id"?: string | null,"parent_id"?: string | null,"refunded_at"?: string | null,"status"?: string,"stripe_checkout_session_id"?: string,"stripe_payment_intent_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_package_purchase_id_fkey"
      columns: ["package_purchase_id"]
isOneToOne: false
      referencedRelation: "package_purchases"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"player_drills": {
                  Row: {
                    "assigned_at": string,"coach_note": string | null,"drill_id": string,"player_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"coach_note"?: string | null,"drill_id": string,"player_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"coach_note"?: string | null,"drill_id"?: string,"player_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_drills_drill_id_fkey"
      columns: ["drill_id"]
isOneToOne: false
      referencedRelation: "drills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "player_drills_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "active": boolean,"age_group": string | null,"created_at": string,"first_name": string,"id": string,"is_self": boolean,"notes": string | null,"parent_id": string,"skill_level": Database["public"]['Enums']["skill_level"] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"age_group"?: string | null,"created_at"?: string,"first_name": string,"id"?: string,"is_self"?: boolean,"notes"?: string | null,"parent_id"?: string,"skill_level"?: Database["public"]['Enums']["skill_level"] | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"age_group"?: string | null,"created_at"?: string,"first_name"?: string,"id"?: string,"is_self"?: boolean,"notes"?: string | null,"parent_id"?: string,"skill_level"?: Database["public"]['Enums']["skill_level"] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "announcements_opt_in": boolean,"client_type": Database["public"]['Enums']["client_type"],"created_at": string,"email": string | null,"full_name": string | null,"id": string,"phone": string | null,"role": Database["public"]['Enums']["app_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcements_opt_in"?: boolean,"client_type"?: Database["public"]['Enums']["client_type"],"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Update: {
                    "announcements_opt_in"?: boolean,"client_type"?: Database["public"]['Enums']["client_type"],"created_at"?: string,"email"?: string | null,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"session_notes": {
                  Row: {
                    "booking_id": string,"coach_notes": string | null,"created_at": string,"homework": string | null,"id": string,"player_id": string,"skills_worked_on": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id": string,"coach_notes"?: string | null,"created_at"?: string,"homework"?: string | null,"id"?: string,"player_id": string,"skills_worked_on"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "booking_id"?: string,"coach_notes"?: string | null,"created_at"?: string,"homework"?: string | null,"id"?: string,"player_id"?: string,"skills_worked_on"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_notes_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: true
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "session_notes_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "players"
      referencedColumns: ["id"]
    }
                  ]
                },"session_types": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"duration_minutes": number,"id": string,"max_players": number,"name": string,"price_cents": number,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_minutes": number,"id"?: string,"max_players"?: number,"name": string,"price_cents": number,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"duration_minutes"?: number,"id"?: string,"max_players"?: number,"name"?: string,"price_cents"?: number,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"stripe_events": {
                  Row: {
                    "id": string,"processed_at": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"processed_at"?: string,"type": string
                  }
                  Update: {
                    "id"?: string,"processed_at"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_assert_hours_allowed":
{ Args: { "p_hours": number,"p_session_type_id": string }; Returns: undefined
                           },
"_assert_player_owned":
{ Args: { "p_parent_id": string,"p_player_id": string }; Returns: undefined
                           },
"_assert_slot_available":
{ Args: { "p_enforce_notice": boolean,"p_hours"?: number,"p_ignore_booking_id": string,"p_session_type_id": string,"p_start": string }; Returns: string
                           },
"_compute_slots":
{ Args: { "p_enforce_notice"?: boolean,"p_from": string,"p_hours"?: number,"p_ignore_booking_id"?: string,"p_session_type_id": string,"p_to": string }; Returns: {
              "capacity": number,"slot_end": string,"slot_start": string,"spots_left": number
            }[]
                           },
"_require_coach":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_take_package_credit":
{ Args: { "p_hours"?: number,"p_parent_id": string,"p_session_type_id": string,"p_start": string }; Returns: string
                           },
"admin_block_time":
{ Args: { "p_end"?: string,"p_end_date"?: string,"p_reason"?: string,"p_start"?: string,"p_start_date"?: string }; Returns: Json
                           },
"admin_complete_session":
{ Args: { "p_booking_id": string,"p_coach_notes"?: string,"p_homework"?: string,"p_skills"?: (string)[],"p_status"?: Database["public"]['Enums']["booking_status"] }; Returns: {
              "booking_id": string,
"coach_notes": string | null,
"created_at": string,
"homework": string | null,
"id": string,
"player_id": string,
"skills_worked_on": (string)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "session_notes"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_create_booking":
{ Args: { "p_actor": string,"p_hours"?: number,"p_note"?: string,"p_override_availability"?: boolean,"p_player_id": string,"p_session_type_id": string,"p_start": string,"p_use_package"?: boolean }; Returns: {
              "cancel_reason": string | null,
"cancelled_at": string | null,
"cancelled_by": string | null,
"created_at": string,
"end_time": string,
"hold_expires_at": string | null,
"hours": number,
"id": string,
"late_cancellation": boolean,
"package_purchase_id": string | null,
"paid_with": Database["public"]['Enums']["payment_method"],
"parent_id": string,
"parent_note": string | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"player_id": string,
"price_cents": number | null,
"reminder_sent_at": string | null,
"session_type_id": string,
"slot_key": string,
"start_time": string,
"status": Database["public"]['Enums']["booking_status"],
"stripe_checkout_session_id": string | null,
"stripe_payment_intent_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_schedule":
{ Args: { "p_from"?: string,"p_include_cancelled"?: boolean,"p_to"?: string }; Returns: {
              "booking_id": string,"end_time": string,"has_session_note": boolean,"late_cancellation": boolean,"local_date": string,"local_start": string,"max_players": number,"paid_with": Database["public"]['Enums']["payment_method"],"parent_email": string,"parent_id": string,"parent_name": string,"parent_note": string,"parent_phone": string,"payment_status": Database["public"]['Enums']["payment_status"],"player_age_group": string,"player_first_name": string,"player_id": string,"player_skill_level": Database["public"]['Enums']["skill_level"],"price_cents": number,"session_type_id": string,"session_type_name": string,"slot_key": string,"start_time": string,"status": Database["public"]['Enums']["booking_status"]
            }[]
                           },
"admin_set_booking_status":
{ Args: { "p_booking_id": string,"p_payment_status"?: Database["public"]['Enums']["payment_status"],"p_status"?: Database["public"]['Enums']["booking_status"] }; Returns: {
              "cancel_reason": string | null,
"cancelled_at": string | null,
"cancelled_by": string | null,
"created_at": string,
"end_time": string,
"hold_expires_at": string | null,
"hours": number,
"id": string,
"late_cancellation": boolean,
"package_purchase_id": string | null,
"paid_with": Database["public"]['Enums']["payment_method"],
"parent_id": string,
"parent_note": string | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"player_id": string,
"price_cents": number | null,
"reminder_sent_at": string | null,
"session_type_id": string,
"slot_key": string,
"start_time": string,
"status": Database["public"]['Enums']["booking_status"],
"stripe_checkout_session_id": string | null,
"stripe_payment_intent_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_stats":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"announcement_recipients":
{ Args: { "p_audience"?: string }; Returns: {
              "email": string,"full_name": string,"parent_id": string
            }[]
                           },
"book_with_package":
{ Args: { "p_actor": string,"p_hours"?: number,"p_parent_note"?: string,"p_player_id": string,"p_session_type_id": string,"p_start": string }; Returns: {
              "cancel_reason": string | null,
"cancelled_at": string | null,
"cancelled_by": string | null,
"created_at": string,
"end_time": string,
"hold_expires_at": string | null,
"hours": number,
"id": string,
"late_cancellation": boolean,
"package_purchase_id": string | null,
"paid_with": Database["public"]['Enums']["payment_method"],
"parent_id": string,
"parent_note": string | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"player_id": string,
"price_cents": number | null,
"reminder_sent_at": string | null,
"session_type_id": string,
"slot_key": string,
"start_time": string,
"status": Database["public"]['Enums']["booking_status"],
"stripe_checkout_session_id": string | null,
"stripe_payment_intent_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_booking":
{ Args: { "p_actor": string,"p_booking_id": string,"p_reason"?: string }; Returns: Json
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"claim_due_reminders":
{ Args: { "p_limit"?: number }; Returns: {
              "booking_id": string,"end_time": string,"parent_email": string,"parent_name": string,"player_first_name": string,"session_type_name": string,"start_time": string
            }[]
                           },
"coach_timezone":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"confirm_stripe_booking":
{ Args: { "p_amount_cents": number,"p_booking_id": string,"p_checkout_session_id": string,"p_currency"?: string,"p_payment_intent_id": string }; Returns: string
                           },
"create_pending_booking":
{ Args: { "p_actor": string,"p_hours"?: number,"p_parent_note"?: string,"p_player_id": string,"p_session_type_id": string,"p_start": string }; Returns: {
              "cancel_reason": string | null,
"cancelled_at": string | null,
"cancelled_by": string | null,
"created_at": string,
"end_time": string,
"hold_expires_at": string | null,
"hours": number,
"id": string,
"late_cancellation": boolean,
"package_purchase_id": string | null,
"paid_with": Database["public"]['Enums']["payment_method"],
"parent_id": string,
"parent_note": string | null,
"payment_status": Database["public"]['Enums']["payment_status"],
"player_id": string,
"price_cents": number | null,
"reminder_sent_at": string | null,
"session_type_id": string,
"slot_key": string,
"start_time": string,
"status": Database["public"]['Enums']["booking_status"],
"stripe_checkout_session_id": string | null,
"stripe_payment_intent_id": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "bookings"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_available_slots":
{ Args: { "p_from"?: string,"p_hours"?: number,"p_session_type_id": string,"p_to"?: string }; Returns: {
              "capacity": number,"slot_end": string,"slot_start": string,"spots_left": number
            }[]
                           },
"grant_package_purchase":
{ Args: { "p_amount_cents": number,"p_checkout_session_id": string,"p_currency"?: string,"p_package_id": string,"p_parent_id": string,"p_payment_intent_id": string }; Returns: {
              "amount_paid_cents": number,
"created_at": string,
"expires_at": string | null,
"id": string,
"label": string,
"package_id": string | null,
"parent_id": string,
"purchased_at": string,
"session_type_id": string | null,
"sessions_remaining": number,
"sessions_total": number,
"source": string,
"stripe_checkout_session_id": string | null,
"stripe_payment_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "package_purchases"
        isOneToOne: true
        isSetofReturn: false
      } },
"has_role":
{ Args: { "p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: boolean
                           },
"invoke_scheduled_function":
{ Args: { "p_function_name": string }; Returns: number
                           },
"is_coach":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"lock_booking_calendar":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"public_next_slots":
{ Args: { "p_limit"?: number,"p_session_type_id"?: string }; Returns: {
              "session_type_id": string,"session_type_name": string,"slot_end": string,"slot_start": string
            }[]
                           },
"record_stripe_refund":
{ Args: { "p_payment_intent_id": string,"p_total_refunded_cents": number }; Returns: undefined
                           },
"release_expired_holds":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reschedule_booking":
{ Args: { "p_actor": string,"p_booking_id": string,"p_new_start": string }; Returns: Json
                           },
"unclaim_reminders":
{ Args: { "p_booking_ids": (string)[] }; Returns: undefined
                           }
          }
          Enums: {
            "app_role": "coach"|"client","booking_status": "pending_payment"|"booked"|"cancelled"|"completed"|"no_show","client_type": "parent"|"adult","inquiry_status": "new"|"replied"|"closed","payment_method": "stripe"|"package"|"manual","payment_status": "unpaid"|"paid"|"refunded","skill_level": "beginner"|"intermediate"|"advanced"|"elite"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "app_role": ["coach", "client"],"booking_status": ["pending_payment", "booked", "cancelled", "completed", "no_show"],"client_type": ["parent", "adult"],"inquiry_status": ["new", "replied", "closed"],"payment_method": ["stripe", "package", "manual"],"payment_status": ["unpaid", "paid", "refunded"],"skill_level": ["beginner", "intermediate", "advanced", "elite"]
          }
        }
} as const
