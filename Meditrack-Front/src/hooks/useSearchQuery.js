import { useSearchParams } from 'react-router-dom';

// The Navbar search text, stored in the URL as ?q=
export const useSearchQuery = () => {
  const [searchParams] = useSearchParams();
  return searchParams.get('q') || '';
};
