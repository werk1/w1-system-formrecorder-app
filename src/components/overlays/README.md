# Overlay Components

## Overview

Two flexible overlay components for different complexity needs:

- **SimpleOverlay** - Lightweight, CSS-only animations for basic overlays
- **AdvancedOverlay** - GSAP-powered with sophisticated timing for complex loading states
- **GlobalOverlays** - Central host that renders store-driven overlays

## Props

### SimpleOverlay Props

- **`isVisible: boolean`** - Controls when overlay shows/hides
- **`children: ReactNode`** - Content to display in overlay
- **`className?: string`** - Additional CSS class
- **`preventScrolling?: boolean`** - Block background scrolling (default: true)
- **`backdropBlur?: boolean`** - Apply backdrop blur effect (default: false)
- **`animation?: 'fade' | 'slide' | 'none'`** - CSS animation type (default: 'fade')

### AdvancedOverlay Props

#### Core Props

- **`isLoading: boolean`** - Controls when overlay shows/hides
- **`variant?: 'fullscreen' | 'content' | 'minimal'`** - Overlay size (default: 'content')
- **`unmountOnExit?: boolean`** - Remove overlay from DOM after fade-out (default: true)
- **`showSpinner?: boolean`** - Show progress indicator (default: true)
- **`children?: ReactNode`** - Custom content instead of spinner

#### Animation Props (GSAP)

- **`fadeInDuration?: number`** - Fade-in time in seconds (default: 0.3)
- **`fadeOutDuration?: number`** - Fade-out time in seconds (default: 0.4)
- **`fadeInDelay?: number`** - Delay before fade-in (default: 0.15)
- **`fadeOutDelay?: number`** - Delay before fade-out (default: 0.1)
- **`animationEase?: string`** - GSAP easing (default: 'power2.out')

#### Styling Props

- **`opacity?: number`** - Overlay opacity (default: 0.95)
- **`backgroundColor?: string`** - Background color (default: CSS variable)
- **`singleCSSCustomClass?: string`** - Additional CSS class
- **`externalCSSModule?: typeof styles`** - Complete CSS module override

### GlobalOverlays

Global overlay host that reacts to store flags (loading is prioritized over overlay):

- `ui.showLoadingOverlay` → AdvancedOverlay (fullscreen)
- `ui.showOverlay` → AdvancedOverlay (same host, shared body lock)
- `ui.showLandscapeOverlay` → SimpleOverlay

Default content is a spinner; set `children: null` in the relevant config to render no content.

Usage:

```tsx
import { GlobalOverlays } from '@/components/overlays';

function AppShell() {
  return (
    <>
      <GlobalOverlays
        loading={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          fadeOutDuration: 0.6,
          spinnerSize: 60,
        }}
        overlay={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          children: <div style={{ color: 'white' }}>Switching language…</div>,
        }}
        landscape={{
          animation: 'slide',
          backdropBlur: true,
        }}
      />
      {/* ...app content */}
    </>
  );
}
```

## Usage Examples

### Import

```tsx
import { SimpleOverlay, AdvancedOverlay } from '@/components/overlays';
```

### Basic Usage

```tsx
function MyComponent() {
  const [isLoading, setIsLoading] = useState(false);

  const simulateLoading = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 3000);
  };

  return (
    <>
      <AdvancedOverlay isLoading={isLoading} />
      <div style={{ padding: '2rem' }}>
        <h2>Basic Loading Example</h2>
        <button onClick={simulateLoading} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Start Loading'}
        </button>
      </div>
    </>
  );
}
```

### Quick Fade for Fast Actions

```tsx
function QuickActionExample() {
  const [isLoading, setIsLoading] = useState(false);

  const quickAction = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <>
      <AdvancedOverlay
        isLoading={isLoading}
        fadeInDuration={0.15}
        fadeOutDuration={0.2}
        fadeInDelay={0}
        fadeOutDelay={0}
      />
      <button onClick={quickAction} disabled={isLoading}>
        Quick Action
      </button>
    </>
  );
}
```

### Smooth Content Loading

```tsx
function ContentLoadingExample() {
  const [isLoading, setIsLoading] = useState(false);

  const loadContent = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 4000);
  };

  return (
    <>
      <AdvancedOverlay
        isLoading={isLoading}
        fadeInDuration={0.6}
        fadeOutDuration={0.8}
        fadeInDelay={0.1}
        fadeOutDelay={0.3}
        variant="fullscreen"
      />
      <button onClick={loadContent} disabled={isLoading}>
        Load Content
      </button>
    </>
  );
}
```

### Custom Content Instead of Spinner

```tsx
function CustomContentExample() {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <>
      <AdvancedOverlay isLoading={isLoading} showSpinner={false}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <h3>Processing...</h3>
          <p>This might take a moment</p>
        </div>
      </AdvancedOverlay>
      <button onClick={() => setIsLoading(!isLoading)}>
        Process Data
      </button>
    </>
  );
}
```

### Form Submission with Overlay

```tsx
function FormSubmissionExample() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    setIsSubmitting(false);
    alert('Form submitted successfully!');
  };

  return (
    <>
      <AdvancedOverlay
        isLoading={isSubmitting}
        fadeInDelay={0.2}     // Slight delay for quick actions
        fadeOutDelay={0.1}    // Quick fade-out on success
      />
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit Form'}
        </button>
      </form>
    </>
  );
}
```

### SimpleOverlay for Basic Cases

```tsx
function SimpleOverlayExample() {
  const [showMessage, setShowMessage] = useState(false);

  return (
    <>
      <SimpleOverlay isVisible={showMessage} animation="fade">
        <div style={{ textAlign: 'center', color: 'white' }}>
          <h3>Please rotate your device</h3>
        </div>
      </SimpleOverlay>
      <button onClick={() => setShowMessage(!showMessage)}>
        Toggle Message
      </button>
    </>
  );
}
```

### Minimal Overlay

```tsx
<AdvancedOverlay
  isLoading={isLoading}
  variant="minimal"
  opacity={0.7}
  backgroundColor="rgba(0, 0, 0, 0.5)"
/>
```

### Data Fetching Hook Integration

```tsx
import { useRichText } from '@/components/data-fetching/hooks/useDataFetchRichText';

function ContentComponent() {
  const { data, isLoading } = useRichText('my-content-id');

  return (
    <>
      <AdvancedOverlay
        isLoading={isLoading}
        variant="content"
        fadeInDuration={0.3}
        fadeOutDuration={0.5}
      />
      <div>{data?.content}</div>
    </>
  );
}
```

### Form Submission

```tsx
function FormComponent() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <AdvancedOverlay
        isLoading={isSubmitting}
        fadeInDelay={0.2}     // Slight delay for quick actions
        fadeOutDelay={0.1}    // Quick fade-out on success
      />
      <form onSubmit={handleSubmit}>
        {/* Form content */}
      </form>
    </>
  );
}
```

### Image Gallery Loading

```tsx
function ImageGallery() {
  const [imagesLoading, setImagesLoading] = useState(true);

  return (
    <>
      <AdvancedOverlay
        isLoading={imagesLoading}
        variant="fullscreen"
        fadeInDuration={0.4}
        fadeOutDuration={1.0}   // Slower fade-out for visual polish
        fadeOutDelay={0.3}
      />
      <div className="gallery">
        {/* Images */}
      </div>
    </>
  );
}
```

## iOS Optimizations

The component automatically includes iOS-specific optimizations:

- Hardware acceleration (`force3D: true`)
- GPU layer forcing (`translate3d`)
- Backface visibility hidden
- Touch interaction prevention
- Viewport height fixes for Safari

## GSAP Integration

Uses GSAP for smooth animations with:

- Hardware acceleration
- Precise timing control
- Smooth easing functions
- iOS-compatible transforms

## Variants

- **`fullscreen`**: Covers entire viewport
- **`content`**: Covers content area
- **`minimal`**: Basic overlay without spinner
