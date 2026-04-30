import { AnimatedIdentityNet } from "./animated-identity-net";

export function SplashScreen({ visible }: { visible: boolean }) {
	return (
		<div
			aria-hidden="true"
			className="pathos-boot-splash"
			data-visible={visible ? "true" : "false"}
		>
			<AnimatedIdentityNet className="pathos-boot-net" />
			<div className="pathos-boot-vignette" />
			<div className="pathos-boot-sweep" />
			<div className="pathos-boot-panel">
				<div className="pathos-boot-title">Pathos</div>
				<div className="pathos-boot-subtitle">Opening workspace</div>
			</div>
		</div>
	);
}
