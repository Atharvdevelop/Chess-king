import { supabase } from './supabase';

// Immediately hide the page to prevent flash of unauthenticated content
document.documentElement.classList.add('opacity-0');

async function checkAuthentication() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      // No session, redirect to index.html (login gate)
      window.location.href = '/index.html';
      return;
    }

    // User is authenticated, expose the page and the client
    (window as any).supabase = supabase;
    document.documentElement.classList.remove('opacity-0');
  } catch (error) {
    console.error('Authentication guard error:', error);
    window.location.href = '/index.html';
  }
}

// Run on DOMContentLoaded or immediately if DOM is already parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkAuthentication);
} else {
  checkAuthentication();
}
