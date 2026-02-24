# AWS Note Taking

> A sidebar feature for creating and storing notes about AWS services with the ability to reference and hyperlink deployed infrastructure from your connected AWS account.

## Overview

AWS Note Taking provides a dedicated "Notes" panel in the AWS Explorer sidebar where users can:

- Create and manage notes about AWS services and infrastructure
- Reference deployed AWS resources (Lambda functions, EC2 instances, S3 buckets) using autocomplete
- Hyperlink notes to actual resources from the connected AWS account
- Navigate directly to linked resources in the AWS Console or AWS Explorer

## User Experience

### Creating a Note

1. Open the **Notes** panel in the AWS Explorer sidebar
2. Click the **Create Note** button (or use the command palette: `AWS: Create Note`)
3. Enter a title for your note
4. The note editor opens where you can add content

### Linking AWS Resources

While editing a note, type one of the following triggers to activate resource autocomplete:

- `@lambda` - Search for Lambda functions
- `@ec2` - Search for EC2 instances
- `@s3` - Search for S3 buckets

The autocomplete dropdown will query your connected AWS account and display matching resources. Select a resource to insert a hyperlink into your note.

**Example:** Type `TODO: upgrade @lambda` and select `my-function` from the dropdown to create a linked reference.

### Navigating to Resources

Linked resources appear as child nodes under each note in the tree view. Right-click a resource reference to:

- **Open in AWS Console** - Opens the resource in your browser
- **Reveal in Explorer** - Navigates to the resource in the AWS Explorer tree

## Architecture

### Components

| Component | Location | Description |
|-----------|----------|-------------|
| `NotesExplorer` | `awsNotes/explorer/notesExplorer.ts` | TreeDataProvider for the sidebar view |
| `NoteNode` | `awsNotes/explorer/noteNode.ts` | Tree item representing a single note |
| `AwsResourceRefNode` | `awsNotes/explorer/awsResourceRefNode.ts` | Tree item for linked resource references |
| `NotesRepository` | `awsNotes/models/note.ts` | Data model and persistence layer |
| `NoteEditorPanel` | `awsNotes/vue/noteEditor/` | Webview-based note editor with autocomplete |
| `noteCommands` | `awsNotes/commands/noteCommands.ts` | Command handlers for note operations |
| `resourceUtils` | `awsNotes/utils/resourceUtils.ts` | Resource parsing and AWS Console URL building |

### Data Model

Notes are stored in VS Code's GlobalState with the following structure:

```typescript
interface Note {
    id: string              // Unique identifier (UUID)
    title: string           // User-provided title
    content: string         // Note body text
    awsResourceRefs: AwsResourceRef[]  // Linked resources
    createdAt: number       // Creation timestamp
    updatedAt: number       // Last modification timestamp
}

interface AwsResourceRef {
    resourceArn: string     // Full ARN of the resource
    resourceName: string    // Display name
    serviceType: 'lambda' | 'ec2' | 's3'
    regionCode: string      // AWS region
}
```

### Commands

| Command ID | Description |
|------------|-------------|
| `aws.notes.create` | Create a new note |
| `aws.notes.edit` | Open note in editor |
| `aws.notes.delete` | Delete a note (with confirmation) |
| `aws.notes.view` | View note as markdown |
| `aws.notes.refresh` | Refresh the notes list |
| `aws.notes.openResourceInConsole` | Open linked resource in AWS Console |
| `aws.notes.revealInExplorer` | Reveal linked resource in AWS Explorer |

## Implementation Details

### Resource Autocomplete

The note editor webview listens for `@service` patterns in the text content. When detected:

1. The frontend sends a `searchResources` message to the backend
2. The backend queries the appropriate AWS SDK client (Lambda, EC2, S3)
3. Results are filtered by the search query and returned to the frontend
4. The frontend displays a dropdown with matching resources
5. On selection, a formatted resource reference is inserted into the note

### Persistence

Notes are persisted using VS Code's `globalState` API, which stores data in the user's VS Code settings directory. This ensures notes persist across sessions and are tied to the user's VS Code installation.

### Console URL Generation

The `buildConsoleUrl()` function constructs direct links to resources in the AWS Console based on service type and region:

- Lambda: `https://{region}.console.aws.amazon.com/lambda/home?region={region}#/functions/{name}`
- EC2: `https://{region}.console.aws.amazon.com/ec2/v2/home?region={region}#InstanceDetails:instanceId={id}`
- S3: `https://s3.console.aws.amazon.com/s3/buckets/{name}`

## Testing

Unit tests are located in `packages/core/src/test/awsNotes/` covering:

- `NotesRepository` - CRUD operations and persistence
- `NotesExplorer` - Tree data provider behavior
- `NoteNode` - Tree item rendering
- `AwsResourceRefNode` - Resource reference display
- `resourceUtils` - URL generation and reference parsing

Run tests with:

```bash
npm run test -- --grep "AWS Notes"
```
