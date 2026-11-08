import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { trackBackNavigation } from './lib/back-navigation'

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    // The layout persists across pages, so its scroll container must be reset on navigation
    scrollToTopSelectors: ['.page-content'],
    defaultPreloadStaleTime: 0,
    defaultViewTransition: {
      // Arriving with the upload dialog open: the page-content snapshot would be painted over
      // the dialog (it lives outside .page-content), so skip the cross-fade for those
      types: ({ toLocation }) => {
        const { upload } = toLocation.search as { upload?: unknown }
        return upload === true || upload === 'true' ? false : []
      },
    },
  })

  trackBackNavigation(router)

  return router
}
