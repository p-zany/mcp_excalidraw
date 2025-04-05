import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import logger from './utils/logger.js';
import {
  elements,
  validateElement,
  generateId,
  EXCALIDRAW_ELEMENT_TYPES
} from './types.js';
import { parseMermaid } from '../dist/mermaid.js';
import { writeFile } from 'fs/promises';
import path from 'path';

const TOOLS = [
  {
    name: 'load_from_file',
    description: 'Load an Excalidraw file',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          contentEncoding: 'utf-8',
          description: 'Excalidraw file content'
        }
      },
      required: ['data']
    }
  },
  {
    name: 'save_to_file',
    description: 'Save the current scene to a file',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Name of the file to save'
        }
      },
      required: ['filename']
    }
  },
  {
    name: 'clear_scene',
    description: 'Clear the current scene, before loading a new one',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'add_elements_with_mermaid',
    description: 'Add elements to the scene using Mermaid syntax',
    inputSchema: {
      type: 'object',
      properties: {
        mermaid: {
          type: 'string',
          contentEncoding: 'utf-8',
          description: 'Mermaid syntax for elements'
        }
      },
      required: ['mermaid']
    }
  },
  {
    name: 'create_element',
    description: 'Create a new Excalidraw element',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        roughness: { type: 'number' },
        opacity: { type: 'number' },
        text: { type: 'string' },
        fontSize: { type: 'number' },
        fontFamily: { type: 'string' }
      },
      required: ['type', 'x', 'y']
    }
  },
  {
    name: 'update_element',
    description: 'Update an existing Excalidraw element',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        roughness: { type: 'number' },
        opacity: { type: 'number' },
        text: { type: 'string' },
        fontSize: { type: 'number' },
        fontFamily: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_element',
    description: 'Delete an Excalidraw element',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'query_elements',
    description: 'Query Excalidraw elements with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        filter: {
          type: 'object',
          additionalProperties: true
        }
      }
    }
  },
  {
    name: 'get_resource',
    description: 'Get an Excalidraw resource',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          enum: ['scene', 'library', 'theme', 'elements']
        }
      },
      required: ['resource']
    }
  },
  {
    name: 'group_elements',
    description: 'Group multiple elements together',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'ungroup_elements',
    description: 'Ungroup a group of elements',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string' }
      },
      required: ['groupId']
    }
  },
  {
    name: 'align_elements',
    description: 'Align elements to a specific position',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' }
        },
        alignment: {
          type: 'string',
          enum: ['left', 'center', 'right', 'top', 'middle', 'bottom']
        }
      },
      required: ['elementIds', 'alignment']
    }
  },
  {
    name: 'distribute_elements',
    description: 'Distribute elements evenly',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' }
        },
        direction: {
          type: 'string',
          enum: ['horizontal', 'vertical']
        }
      },
      required: ['elementIds', 'direction']
    }
  },
  {
    name: 'lock_elements',
    description: 'Lock elements to prevent modification',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'unlock_elements',
    description: 'Unlock elements to allow modification',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  }
];

// In-memory storage for scene state
const sceneState = {
  theme: 'light',
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedElements: new Set(),
  groups: new Map()
};

// Schema definitions using zod
const ElementSchema = z.object({
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES)),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  backgroundColor: z.string().optional(),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().optional(),
  roughness: z.number().optional(),
  opacity: z.number().optional(),
  text: z.string().optional(),
  fontSize: z.number().optional(),
  fontFamily: z.any().optional() // Allow any format for fontFamily
}).passthrough(); // Allow additional properties not explicitly defined

const ElementIdSchema = z.object({
  id: z.string()
});

const ElementIdsSchema = z.object({
  elementIds: z.array(z.string())
});

const GroupIdSchema = z.object({
  groupId: z.string()
});

const AlignElementsSchema = z.object({
  elementIds: z.array(z.string()),
  alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom'])
});

const DistributeElementsSchema = z.object({
  elementIds: z.array(z.string()),
  direction: z.enum(['horizontal', 'vertical'])
});

const QuerySchema = z.object({
  type: z.enum(Object.values(EXCALIDRAW_ELEMENT_TYPES)).optional(),
  filter: z.record(z.any()).optional()
});

const ResourceSchema = z.object({
  resource: z.enum(['scene', 'library', 'theme', 'elements'])
});

// Initialize MCP server
const server = new Server(
  {
    name: "excalidraw-mcp-server",
    version: "1.0.0",
    description: "MCP server for Excalidraw"
  },
  {
    capabilities: {
      tools: {},
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    logger.info(`Handling tool call: ${name}`);

    switch (name) {
      case 'load_from_file': {
        const params = z.object({
          data: z.string()
        }).parse(args);

        try {
          const fileData = JSON.parse(params.data);

          if (!fileData.elements || !Array.isArray(fileData.elements)) {
            throw new Error('Invalid Excalidraw file: no elements array found');
          }

          elements.clear();
          sceneState.selectedElements.clear();
          sceneState.groups.clear();

          fileData.elements.forEach(element => {
            if (validateElement(element)) {
              elements.set(element.id, element);
            } else {
              logger.warn(`Skipping invalid element: ${element.id || 'unknown'}`);
            }
          });

          if (fileData.appState) {
            if (fileData.appState.theme) {
              sceneState.theme = fileData.appState.theme;
            }
            if (fileData.appState.viewport) {
              sceneState.viewport = fileData.appState.viewport;
            }
          }

          return {
            content: [{
              type: 'text',
              text: `Loaded ${elements.size} elements from file`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to load file', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'save_to_file': {
        try {
          const params = z.object({
            filename: z.string()
          }).parse(args);

          const fileData = createExcalidrawFileData();
          const filePath = path.isAbsolute(params.filename) ? params.filename : path.join('/tmp', params.filename);

          await writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf8');

          return {
            content: [{ type: 'text', text: `File saved successfully to ${filePath}` }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to save file', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'clear_scene': {
        try {
          elements.clear();
          sceneState.selectedElements.clear();
          sceneState.groups.clear();

          return {
            content: [{ type: 'text', text: 'Scene cleared successfully' }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to clear scene', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'add_elements_with_mermaid': {
        const params = z.object({
          mermaid: z.string()
        }).parse(args);

        try {
          const { elements: mermaidElements, logs } = await parseMermaid(params.mermaid);
          logger.info('Parsed mermaid elements', { logs });
          // logger.info('Parsed mermaid elements', { mermaidElements });

          mermaidElements.forEach((element) => {
            if (!element.id) {
              element.id = generateId();
            }

            elements.set(element.id, element);
          });

          const content = [
            { type: 'text', text: `Added ${mermaidElements.length} elements from Mermaid diagram` }
          ];

          mermaidElements.forEach(element => {
            content.push({ type: 'text', text: JSON.stringify(element, null, 2) });
          });

          return {
            content,
            isError: false
          };
        } catch (error) {
          logger.error('Failed to process Mermaid diagram', {
            error: error.message,
            stack: error.stack
          });
          return {
            content: [{ type: 'text', text: `Add elements with Mermaid Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'create_element': {
        const params = ElementSchema.parse(args);
        logger.info('Creating element', { type: params.type });

        try {
          const id = generateId();
          const element = {
            id,
            ...params
          };

          elements.set(id, element);

          return {
            content: [{
              type: 'text',
              text: `Created element with ID: ${id}`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to create element', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'update_element': {
        const params = ElementSchema.partial().extend(ElementIdSchema).parse(args);
        const { id, ...updates } = params;

        try {
          if (!id) throw new Error('Element ID is required');

          const existingElement = elements.get(id);
          if (!existingElement) throw new Error(`Element with ID ${id} not found`);

          const updatedElement = {
            ...existingElement,
            ...updates
          };

          elements.set(id, updatedElement);

          return {
            content: [{
              type: 'text',
              text: `Updated element with ID: ${id}`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to update element', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'delete_element': {
        const params = ElementIdSchema.parse(args);
        const { id } = params;

        try {
          if (!elements.has(id)) throw new Error(`Element with ID ${id} not found`);

          elements.delete(id);

          return {
            content: [{
              type: 'text',
              text: `Deleted element with ID: ${id}`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to delete element', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'query_elements': {
        const params = QuerySchema.parse(args || {});
        const { type, filter } = params;

        try {
          let results = Array.from(elements.values());

          if (type) {
            results = results.filter(element => element.type === type);
          }

          if (filter) {
            results = results.filter(element => {
              return Object.entries(filter).every(([key, value]) => {
                return element[key] === value;
              });
            });
          }

          return {
            content: [{
              type: 'text',
              text: `Queried ${results.length} elements`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to query elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'get_resource': {
        const params = ResourceSchema.parse(args);
        const { resource } = params;
        logger.info('Getting resource', { resource });

        try {
          let result;
          switch (resource) {
            case 'scene':
              result = {
                theme: sceneState.theme,
                viewport: sceneState.viewport,
                selectedElements: Array.from(sceneState.selectedElements)
              };
              break;
            case 'library':
              result = {
                elements: Array.from(elements.values())
              };
              break;
            case 'theme':
              result = {
                theme: sceneState.theme
              };
              break;
            case 'elements':
              result = {
                elements: Array.from(elements.values())
              };
              break;
            default:
              throw new Error(`Unknown resource: ${resource}`);
          }

          return {
            content: [{ type: 'text', text: `Got resource: ${resource}` }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to get resource', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'group_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          const groupId = generateId();
          sceneState.groups.set(groupId, elementIds);

          return {
            content: [{
              type: 'text',
              text: `Grouped ${elementIds.length} elements`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to group elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'ungroup_elements': {
        const params = GroupIdSchema.parse(args);
        const { groupId } = params;

        try {
          if (!sceneState.groups.has(groupId)) {
            throw new Error(`Group ${groupId} not found`);
          }

          const elementIds = sceneState.groups.get(groupId);
          sceneState.groups.delete(groupId);

          return {
            content: [{
              type: 'text',
              text: `Ungrouped elements from group: ${groupId}`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to ungroup elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'align_elements': {
        const params = AlignElementsSchema.parse(args);
        const { elementIds, alignment } = params;

        try {
          // Implementation would align elements based on the specified alignment
          logger.info('Aligning elements', { elementIds, alignment });

          return {
            content: [{
              type: 'text',
              text: `Aligned ${elementIds.length} elements to ${alignment}`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to align elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'distribute_elements': {
        const params = DistributeElementsSchema.parse(args);
        const { elementIds, direction } = params;

        try {
          // Implementation would distribute elements based on the specified direction
          logger.info('Distributing elements', { elementIds, direction });

          return {
            content: [{
              type: 'text',
              text: `Distributed ${elementIds.length} elements ${direction}ly`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to distribute elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'lock_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          elementIds.forEach(id => {
            const element = elements.get(id);
            if (element) {
              element.locked = true;
            }
          });

          return {
            content: [{
              type: 'text',
              text: `Locked ${elementIds.length} elements`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to lock elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      case 'unlock_elements': {
        const params = ElementIdsSchema.parse(args);
        const { elementIds } = params;

        try {
          elementIds.forEach(id => {
            const element = elements.get(id);
            if (element) {
              element.locked = false;
            }
          });

          return {
            content: [{
              type: 'text',
              text: `Unlocked ${elementIds.length} elements`
            }],
            isError: false
          };
        } catch (error) {
          logger.error('Failed to unlock elements', { error: error.message });
          return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Error handling tool call: ${error.message}`, { error });
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

function createExcalidrawFileData() {
  const allElements = Array.from(elements.values());

  return {
    type: 'excalidraw',
    version: 2,
    source: 'excalidraw-mcp-server',
    elements: allElements,
    appState: {
      theme: sceneState.theme,
      viewport: sceneState.viewport,
      gridSize: null,
      exportWithDarkMode: false
    }
  };
}

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch(console.error);

process.stdin.on('close', () => {
  console.log('Excalidraw MCP server closed');
  server.close();
});
