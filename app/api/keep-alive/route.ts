import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Forces Next.js to run this freshly every time so it actually hits the database
export const dynamic = 'force-dynamic'; 

export async function GET() {
  // 1. Initialize Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 2. Query your actual database table
  const { data, error } = await supabase.from('activities').select('*').limit(1);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 3. Return success
  return NextResponse.json({ 
    success: true, 
    timestamp: new Date().toISOString() 
  });
}