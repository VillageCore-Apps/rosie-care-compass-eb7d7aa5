
import { useState, useEffect } from "react";
import { Menu, X, Search } from "lucide-react";
import BottomNavigation from "@/components/BottomNavigation";
import { CreativeStorySection } from "@/components/CreativeStorySection";
import OfficialBookSection from "@/components/OfficialBookSection";
import MusicSection from "@/components/MusicSection";
import { searchContent } from "@/lib/searchContent";
import { Link } from "react-router-dom";
import Submit from "@/components/Submit";
import { IndexSkeleton } from "@/components/ui/skeletons";
import { useTextSettings } from "@/context/TextSettingsContext";

type SearchResults = {
  chapters: any[];
  books: any[];
  topics: any[];
  stories: any[];
};

const Index = () => {
  const { fontScale } = useTextSettings();

  function highlightMatch(text: string, query: string) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.split(regex).map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ?
        (<mark key={i} className='bg-yellow-200'>{part}</mark>) : (part)
    )
  }
  function highlightSnippet(content: string, query: string, radius = 40): JSX.Element {
    if (!content || !query) return <>{content}</>;

    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerContent.indexOf(lowerQuery);

    if (matchIndex === -1) {
      // no match, fallback
      return <>{content.slice(0, 80)}...</>;
    }

    const start = Math.max(0, matchIndex - radius);
    const end = Math.min(content.length, matchIndex + query.length + radius);

    const before = content.slice(start, matchIndex);
    const match = content.slice(matchIndex, matchIndex + query.length);
    const after = content.slice(matchIndex + query.length, end);

    return (
      <>
        {start > 0 && '...'}
        {before}
        <span className="bg-yellow-200 font-semibold text-black">{match}</span>
        {after}
        {end < content.length && '...'}
      </>
    );
  }

  const [results, setResults] = useState<SearchResults | null>(null);
  const [inputQuery, setInputQuery] = useState('');
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [profileLoaded, setprofileLoaded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasInput, setHasInput] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = "/blue-rosie.png";
    img.onload = () => {
      setprofileLoaded(true);
    };
  }, []);

  if (!profileLoaded) {
    return <IndexSkeleton />;
  }
  const handleSearch = async () => {
    setHasInput(true);
    setIsSearching(true);
    setQuery(inputQuery);
    try {
      const results = await searchContent(inputQuery);
      setResults(results);
      console.log('results: ', results);
    } catch (err) {
      console.error('Error searching: ', err);
    } finally {
      setIsSearching(false);
    }
  };

  console.log('profile loading: ', profileLoaded);

  return (
    <div className="min-h-screen relative">
      {/* Mobile App Header */}
      {/* <header className="relative z-40 py-4 animate-fade-in bg-white/90 backdrop-blur-md border-b border-gray-200/30">
        <div className="flex flex-wrap items-center justify-between">
          <div className="flex items-center justify-center space-x-3 py-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl overflow-hidden p-1 border-4 border-slate-300">
                <img
                  src="/2.png"
                  alt="villagecore logo"
                  className="w-full h-full object-cover "
                />
              </div>
            </div>

            <div>
              <h1 className="text-lg font-semibold text-[#1b1c24] italic mr-2">Caregiving for Seniors</h1>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              className="p-2 bg-[#a0a0ab] rounded-lg active:scale-105"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Open Search"
            >
              <Search className="h-5 w-5 text-white" />
            </button>
            <div className='relative inline-block space-y-3'>

              <button className="p-2 bg-gray-100 rounded-lg active:scale-105"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                <Menu className="h-5 w-5 text-[#373618]" />
              </button>
              {isMenuOpen && (
                <div className={`absolute ${fontScale !== 1 ? 'left-0' : 'right-0'} mt-2 w-36 bg-white border rounded-lg shadow-lg z-50 p-1`}>
                  <a href="/privacy-policy" className='block px-4 py-2 hover:bg-gray-100 text-gray-800'>
                    Privacy Policy
                  </a>
                  <a href="/terms-of-service" className='block px-4 py-2 hover:bg-gray-100 text-gray-800'>
                    Terms of Service
                  </a>
                  <a href="/acceptable-use-policy" className='block px-4 py-2 hover:bg-gray-100 text-gray-800'>
                    Acceptable Use Policy
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </header> */}
      <header className={`relative z-40 py-4 bg-white/90 backdrop-blur-md border-b border-gray-200/30`}>
        <div className="flex flex-wrap items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center justify-center space-x-3 py-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl overflow-hidden p-1 border-4 border-slate-300">
                <img
                  src="/2.png"
                  alt="villagecore logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <h1 className="text-lg font-semibold text-[#1b1c24] italic mr-2">Caregiving for Seniors</h1>
          </div>

          {/* Search + Menu */}
          <div className="flex items-center space-x-3">
            <button
              className="p-2 bg-[#a0a0ab] rounded-lg active:scale-105"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Open Search"
            >
              <Search className="h-5 w-5 text-white" />
            </button>

            <button
              className="relative w-10 h-10 p-2 bg-gray-100 rounded-lg active:scale-105 overflow-hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle Menu"
            >
              {/* Menu icon */}
              <Menu
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                            h-5 w-5 text-[#373618] transition-all duration-300
                            ${isMenuOpen ? 'opacity-0 rotate-45 scale-50' : 'opacity-100 rotate-0 scale-100'}
                          `}
              />

              {/* X icon */}
              <X
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                            h-5 w-5 text-[#373618] transition-all duration-300
                            ${isMenuOpen ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-45 scale-50'}
                          `}
              />
            </button>

          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-200 ${isMenuOpen ? 'max-h-[500px]' : 'max-h-0'
            }`}
        >
          <div className={`p-4 space-y-2 text-center transition-all duration-300 ${isMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'}`}>
            {/* dropdown content */}
            <a href="/privacy-policy" className="block hover:underline text-gray-800">
              Privacy Policy
            </a>
            <a href="/terms-of-service" className="block hover:underline text-gray-800">
              Terms of Service
            </a>
            <a href="/acceptable-use-policy" className="block hover:underline text-gray-800">
              Acceptable Use Policy
            </a>
          </div>
        </div>

      </header>



      {/* Overlay */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex flex-col items-center justify-center">
          <div className="relative w-3/4 px-6">
            {/* Close Button */}
            <button
              onClick={() => setIsSearchOpen(false)}
              className="absolute -top-10 right-0 text-white"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="flex flex-row gap-4">
              {/* Search Bar */}
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="flex-1 w-full p-4 rounded-lg text-lg shadow-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#a5aba0]"
              />
              <button
                className="text-white rounded-lg p-4 bg-gray-700 hover:bg-gray-800 transition-colors"
                onClick={handleSearch}
              >Enter</button>
            </div>
          </div>
          <div className='mt-6 bg-white p-4 rounded shadow max-h-[60vh] overflow-y-auto w-[340px] md:w-[400px] lg:w-[470px]'>
            {!hasInput && (
              <p className="text-gray-500 text-center">No search yet. Try entering a keyword.</p>
            )}

            {isSearching && (
              <div className='flex flex-col items-center justify-center gap-1 p-4'>
                <svg className="w-16 h-16 animate-spin text-gray-900/50" viewBox="0 0 64 64" fill="none"
                  xmlns="http://www.w3.org/2000/svg" width="24" height="24">
                  <path
                    d="M32 3C35.8083 3 39.5794 3.75011 43.0978 5.20749C46.6163 6.66488 49.8132 8.80101 52.5061 11.4939C55.199 14.1868 57.3351 17.3837 58.7925 20.9022C60.2499 24.4206 61 28.1917 61 32C61 35.8083 60.2499 39.5794 58.7925 43.0978C57.3351 46.6163 55.199 49.8132 52.5061 52.5061C49.8132 55.199 46.6163 57.3351 43.0978 58.7925C39.5794 60.2499 35.8083 61 32 61C28.1917 61 24.4206 60.2499 20.9022 58.7925C17.3837 57.3351 14.1868 55.199 11.4939 52.5061C8.801 49.8132 6.66487 46.6163 5.20749 43.0978C3.7501 39.5794 3 35.8083 3 32C3 28.1917 3.75011 24.4206 5.2075 20.9022C6.66489 17.3837 8.80101 14.1868 11.4939 11.4939C14.1868 8.80099 17.3838 6.66487 20.9022 5.20749C24.4206 3.7501 28.1917 3 32 3L32 3Z"
                    stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
                  <path
                    d="M32 3C36.5778 3 41.0906 4.08374 45.1692 6.16256C49.2477 8.24138 52.7762 11.2562 55.466 14.9605C58.1558 18.6647 59.9304 22.9531 60.6448 27.4748C61.3591 31.9965 60.9928 36.6232 59.5759 40.9762"
                    stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" className="text-gray-900">
                  </path>
                </svg>
                <h2 className="text-lg font-semibold text-gray-700">Searching...</h2>              </div>
            )}

            {hasInput && !isSearching && !results && (
              <p className="text-gray-500 text-center">No results found.</p>
            )}
            {results && !isSearching &&
              Object.entries(results).map(([table, items]) => {
                if (!items || items.length === 0) return null;
                return (
                  <div key={table} className='mb-4'>
                    <h2 className='text-lg font-semibold capitalize'>{table}</h2>
                    <ul className='list-none ml-6'>
                      {items.map((item, i) => {
                        return (
                          <li key={item.id || i} className="text-base border-b pb-2">
                            {table === "chapters" && (
                              <Link
                                to={`/chapters/${item.id}/topics`}
                              >
                                <p className="font-semibold">{highlightMatch(item.name, query)}</p>
                                <p className="text-gray-600">{highlightMatch(item.description, query)}</p>
                              </Link>
                            )}

                            {table === "books" && (
                              <Link to={`/book-details/${item.id}`}>
                                <p className="font-semibold">{highlightMatch(item.title, query)}</p>
                                <p className="text-gray-600 italic">by {highlightMatch(item.author, query)}</p>
                              </Link>
                            )}

                            {table === "stories" && (
                              <Link to={`/chapters/${item.chapter_id}/topics/${item.topic_id}/stories?storyId=${item.id}`}>
                                <p className="font-semibold">{highlightMatch(item.title, query)}</p>
                                <p className="text-gray-600">{highlightSnippet(item.content, query)}...</p>
                              </Link>
                            )}

                            {table === "topics" && (
                              <Link to={`/chapters/${item.chapter_id}/topics/${item.id}/stories`}>
                                <p className="font-semibold">{highlightMatch(item.name, query)}</p>
                              </Link>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })
            }
          </div>
        </div>
      )}
      {/* Rosie now greets from the companion bar at the top of the app,
          so the old static hero card was retired. */}

      {/* Enhanced Creative Stories Section */}
      <div className="animate-slide-up">
        <CreativeStorySection />
      </div>

      {/* Official Book Section */}
      <div className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <OfficialBookSection />
      </div>

      {/* Music Section */}
      <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
        <MusicSection />
      </div>

      <Submit />

      <BottomNavigation />
    </div>
  );
};

export default Index;
