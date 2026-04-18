import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';

/**
 * Dev-only page that receives the session token from the OAuth callback
 * and sets it as a cookie on the frontend's domain (localhost).
 */
export function AuthCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const returnTo = searchParams.get('return_to') ?? '/';

    if (token) {
      document.cookie = `cruise_session=${token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
    }

    navigate(returnTo, { replace: true });
  }, [searchParams, navigate]);

  return null;
}
