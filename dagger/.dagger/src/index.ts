/**
	* A Dagger module for building unkey Projects using Go and Docker.
	*
*/
import { Directory, File, func, object } from "@dagger.io/dagger";
import { GolangProject } from "./golang";
import { TSProject } from "./node";

@object()
export class Dagger {

	/**
	* Sets up the Go project, builds it, and returns the binary file.
	* @param source - Directory containing the Go source code
	* @param buildDir - Directory to build the project
	* @param output - Name of the output binary file
	* @param mainFile - Path to the main Go file
	* @returns File - The built binary file
	* @description This function sets up the Go project, builds it, and returns the binary file.
	*/
	@func()
	buildGoProject(source: Directory, buildDir: string, output: string, mainFile: string): File {
		const project = new GolangProject(source);
		return project
			.setup(buildDir)
			.build(output, mainFile);
	}


	/**
	* Build the unkey API binary.
	*/
	@func()
	buildUnkeyAPI(source: Directory, buildDir: string): File {
		return this.buildGoProject(source, buildDir, "unkey-api", "./build/api/main.go");
	}

	@func()
	buildAndPublishUnkeyAPI(source: Directory, buildDir: string, imageName: string, awsCreds: File, region: string, accountID: string): Promise<string[]> {
		const project = new GolangProject(source);
		return project
			.setup(buildDir)
			.buildDockerImage(imageName, "unkey-api", "./build/api/main.go", awsCreds, region, accountID, ["latest", "latest-dev"]);
	}


	/**
	* Build the unkey Health binary.
	*/
	@func()
	buildUnkeyHealth(source: Directory, buildDir: string): File {
		return this.buildGoProject(source, buildDir, "unkey-health", "./build/health/main.go");
	}

	/**
	* Build the unkey API TypeScript project.
	*/
	@func()
	buildTypeScript(source: Directory, buildDir: string): File {
		const project = new TSProject(source);
		return project
			.setup()
			.build(buildDir)
	}
}
