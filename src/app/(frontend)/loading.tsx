import { SpinnerProgressIndicator } from '@/components/progress-indicators';
import { StaticOverlay } from '@/components/overlays';

export default function Loading() {
	return (
		<StaticOverlay
			variant="fullscreen"
			backgroundColor="rgba(255, 255, 255, 0.95)"
		>
			<SpinnerProgressIndicator size={60} />
		</StaticOverlay>
	);
}
