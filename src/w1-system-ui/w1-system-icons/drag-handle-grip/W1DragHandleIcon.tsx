/**
 * Props interface for the DragHandleIcon component
 */
type W1DragHandleIconProps = {
	/** Width of each line in the grip icon */
	lineWidth?: number;
	/** Length of each line in the grip icon */
	lineLength?: number;
	/** Number of parallel lines to draw (1 or 2) */
	lines?: number;
	/** Vertical distance between lines when multiple lines are drawn */
	distance?: number;
	/** Whether the icon should rotate based on device orientation */
	rotateWithDevice?: boolean;
	/** Color of the lines */
	color?: string;
	/** Width of the SVG element */
	width?: number;
	/** Height of the SVG element */
	height?: number;
	/** CSS rotation transform value when rotateWithDevice is true */
	deviceRotation?: string;
};

/**
 * A customizable drag handle/grip icon component that renders one or more horizontal lines
 *
 * @component
 * @param {Object} props - Component props
 * @param {number} [props.lineWidth=3] - Width of each line
 * @param {number} [props.lineLength=100] - Length of each line
 * @param {number} [props.lines=2] - Number of parallel lines (1 or 2)
 * @param {number} [props.distance=20] - Vertical spacing between lines
 * @param {boolean} [props.rotateWithDevice=true] - Whether to rotate based on device orientation
 * @param {string} [props.color='rgba(0, 0, 0, 0.3)'] - Color of the lines
 * @param {number} [props.width=120] - Width of SVG element
 * @param {number} [props.height=120] - Height of SVG element
 * @param {string} [props.deviceRotation='0deg'] - Rotation value when rotateWithDevice is true
 * @returns {JSX.Element} Rendered drag handle icon
 */
export default function W1DragHandleIcon({
	lineWidth = 3,
	lineLength = 100,
	lines = 2,
	distance = 20,
	rotateWithDevice = true,
	color = 'rgba(0, 0, 0, 0.3)',
	width = 120,
	height = 120,
	deviceRotation = '0deg'
}: W1DragHandleIconProps) {
	// Calculate viewBox dimensions to accommodate line length
	const padding = lineWidth * 2;
	const viewBoxWidth = lineLength + padding * 2;

	// Only consider distance if there are multiple lines
	const effectiveDistance = lines > 1 ? distance : 0;
	const viewBoxHeight = lines > 1 ? (lines - 1) * effectiveDistance + padding * 2 : padding * 2;

	const viewBoxPadding = Math.max(viewBoxWidth, viewBoxHeight) * 0.1;

	/**
	 * Generates SVG line elements based on the specified number of lines
	 * @returns {JSX.Element[]} Array of SVG line elements
	 */
	const generateLines = () => {
		const lineElements = [];
		const startX = -lineLength / 2;
		const endX = lineLength / 2;

		if (lines === 1) {
			// Single line is always centered
			lineElements.push(
				<line
					key={0}
					x1={startX}
					y1={0}
					x2={endX}
					y2={0}
					stroke={color}
					strokeWidth={lineWidth}
					strokeLinecap="round"
				/>
			);
		} else {
			// Multiple lines are distributed evenly
			const totalHeight = (lines - 1) * effectiveDistance;
			const startY = -totalHeight / 2;

			for (let i = 0; i < lines; i++) {
				lineElements.push(
					<line
						key={i}
						x1={startX}
						y1={startY + i * effectiveDistance}
						x2={endX}
						y2={startY + i * effectiveDistance}
						stroke={color}
						strokeWidth={lineWidth}
						strokeLinecap="round"
					/>
				);
			}
		}
		return lineElements;
	};

	return (
		<svg
			width={width}
			height={height}
			viewBox={`${-viewBoxWidth / 2 - viewBoxPadding} ${-viewBoxHeight / 2 - viewBoxPadding}
                     ${viewBoxWidth + viewBoxPadding * 2} ${viewBoxHeight + viewBoxPadding * 2}`}
			style={{
				transform: rotateWithDevice ? `rotate(${deviceRotation})` : undefined,
				transformOrigin: 'center center',
				position: 'absolute'
			}}
		>
			{generateLines()}
		</svg>
	);
}
