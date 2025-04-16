import { Container, dag, Directory, func, object, Platform, Secret } from "@dagger.io/dagger";
import { GolangProject } from "./golang";
import { TSProject } from "./node";

@object()
export class Dagger2 {
	private source: Directory;
	private registry: string;
	private gitHash: string;
	private dateTag: string;
	private awsECRToken: Secret;
	constructor(
		source: Directory,
		ecrToken: Secret,
		registry: string = "442426849924.dkr.ecr.us-west-2.amazonaws.com",
		gitHash: string = "",
		dateTag: string = ""
	) {
		this.source = source;
		this.registry = registry;
		this.gitHash = gitHash;
		this.dateTag = dateTag || new Date().toISOString().slice(0, 10).replace(/-/g, "");
		this.awsECRToken = ecrToken
	}

	/**
	 * Asynchronously builds and pushes a service container based on the provided parameters and type
	 */
	@func()
	async buildAndPushService(
		name: string,
		imageName: string,
		path: string,
		type: string,
		// Optional parameters
		dockerfile?: string,
		buildCommand?: string[]
	): Promise<string> {
		let container: Container;

		switch (type) {
			case "go":
				const goProject = new GolangProject(this.source);
				goProject.setup(path);
				container = goProject.transferBinary(name, ".");
				break;

			case "ts":
				const tsProject = new TSProject(this.source);
				tsProject.setup(path);
				const builtDir = tsProject.build(path, buildCommand);

				// Create container from built files
				container = dag.container({ platform: "linux/arm64" as Platform })
					.from("node:alpine")
					.withDirectory("/app", builtDir)
					.withWorkdir("/app")
					.withEntrypoint(["npm", "run", "start"])
				break;

			case "docker":
				container = dag.container({ platform: "linux/arm64" as Platform })
					.build(this.source, {
						dockerfile: dockerfile,
					});
				break;
			default:
				throw new Error(`Unsupported type: ${type}`);
		}

		// Tag and push the image
		const imageTag = `${this.gitHash.slice(0, 7)}-${this.dateTag}`;
		const fullImageName = `${this.registry}/${imageName}`;


		await container
			.withRegistryAuth(
				this.registry,
				"AWS",
				this.awsECRToken
			)
			.publish(`${fullImageName}:${imageTag}`);

		await container
			.withRegistryAuth(
				this.registry,
				"AWS",
				this.awsECRToken
			)
			.publish(`${fullImageName}:latest`);

		return `Successfully built and pushed ${fullImageName}:${imageTag}`;
	}

	/**
	 * buildAndPushAll asynchronously builds and pushes multiple services based on their configurations.
	 */
	@func()
	async buildAndPushAll(): Promise<string[]> {
		const services = [
			{
				name: "platform_auth",
				dockerfile: "build/platform.auth/v0/Dockerfile.platform.auth",
				imageName: "keygraph-sandbox/platform-auth",
				path: "cmd/platform.auth",
				type: "go",
			},
			{
				name: "platform_core",
				dockerfile: "build/platform.core/v0/Dockerfile.platform.core",
				imageName: "keygraph-sandbox/platform-core",
				path: "cmd/platform.core",
				type: "go",
			},
			{
				name: "mdm_core",
				dockerfile: "build/mdm.core/v0/Dockerfile.mdm.core",
				imageName: "keygraph-sandbox/mdm-core",
				path: "cmd/mdm.core",
				type: "go",
			},
			{
				name: "react_app",
				dockerfile: "build/react-app/v0/Dockerfile.react-app",
				imageName: "keygraph-sandbox/react-app",
				path: "ts/apps/web-app",
				type: "ts",
				buildCommand: ["pnpm", "run", "build"],
			},
			{
				name: "gql_gateway",
				dockerfile: "build/gql-gateway/v0/Dockerfile.gql-gateway",
				imageName: "keygraph-sandbox/gql-gateway",
				path: "ts/apps/graphql",
				type: "ts",
				buildCommand: ["pnpm", "run", "build"],
			},
			{
				name: "redpanda_connect",
				dockerfile: "build/redpanda.connect/v0/Dockerfile.redpanda.connect",
				imageName: "keygraph-sandbox/redpanda-connect",
				path: "pkg/redpanda",
				type: "docker",
			},
			{
				name: "temporal-worker",
				dockerfile: "build/temporal-worker/v0/Dockerfile.temporal-worker",
				imageName: "keygraph-sandbox/temporal-worker",
				path: "cmd/temporal-worker",
				type: "go",
			},
		];

		const results = await Promise.all(
			services.map((service) => this.buildAndPushService(
				service.name,
				service.dockerfile,
				service.imageName,
				service.path,
				service.type,
				service.buildCommand
			))
		);

		return results;
	}

}